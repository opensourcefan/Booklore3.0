"""LLM synthesis stage.

Constructs a context block tagged with stable chunk IDs, asks the LLM for a
markdown response with inline [ChunkID: N] citations, and parses/validates that
response. JSON output is still accepted as a fallback.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Callable

from models import ParsedQuery, RetrievedChunk, SynthesisResult, AnswerItem

logger = logging.getLogger("fable-ai-search")


_SYSTEM_PROMPT_TEMPLATE = """You are an AI search assistant. Answer ONLY from the provided Context.
Do not use external knowledge. Do not invent facts.

Return your answer as markdown bullet points. For each item, cite the ChunkID from the Context that supports it using the exact format [ChunkID: N] at the end of the line.

Example:
- Batman: The Return Of Bruce Wayne. [ChunkID: 142]
- Doom Patrol Issue 36. [ChunkID: 142]

Rules:
- If the Context contains chunks, you MUST return at least one item citing a ChunkID.
- Only say "I could not find any relevant information for this search." if the Context is literally empty or completely unrelated.
- Each item must have at least one [ChunkID: N] citation from the Context.
- Do not include information that is not supported by the Context.
- Do not add years, authors, or other details that are not in the Context.
- The user asked for up to {requested_count} items, but you must NOT invent items to reach that number. Only return items that are directly supported by the Context. If the Context supports fewer items, return fewer.
- Do NOT split a single chunk into multiple numbered items. If one chunk contains several related facts, return them as ONE item or pick the single most relevant fact.
"""


def build_context(query: ParsedQuery, chunks: list[RetrievedChunk]) -> str:
    """Build a context string where each chunk is tagged with a stable ChunkID."""
    lines = [f"Query: {query.raw}\n\nContext:"]
    for chunk in chunks:
        page = chunk.page_number if chunk.page_number is not None else "N/A"
        lines.append(
            f"\n[ChunkID: {chunk.chunk_id}] Source: {chunk.book_title}, Page {page}\n{chunk.text}"
        )
    return "\n".join(lines)


def synthesize(
    query: ParsedQuery,
    chunks: list[RetrievedChunk],
    generate_fn: Callable[[str, str, int, float, list[dict] | None, str | None], str],
    max_tokens: int,
    temperature: float,
    chat_history: list[dict] | None = None,
    requested_count: int | None = None,
) -> SynthesisResult:
    """Call the LLM and parse the structured response.

    Args:
        query: Parsed query.
        chunks: Retrieved chunks to use as context.
        generate_fn: Function that calls the LLM (signature matches existing _generate_answer).
        max_tokens: Max tokens for LLM generation.
        temperature: LLM temperature.
        chat_history: Optional previous turns.

    Returns:
        SynthesisResult. If parsing fails, returns no_relevant_info=True so the caller
        can fall back to RAW display.
    """
    if not chunks:
        return SynthesisResult(no_relevant_info=True)

    context = build_context(query, chunks)
    system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(
        requested_count=requested_count if requested_count is not None else "the requested number of"
    )
    # Prepend the system prompt to the context so the LLM sees the rules.
    context = system_prompt + "\n\n" + context

    try:
        raw = generate_fn(query.raw, context, max_tokens, temperature, chat_history, system_prompt)
    except Exception as e:
        logger.error("LLM generation failed: %s", e)
        return SynthesisResult(no_relevant_info=True)

    logger.debug("Raw LLM synthesis response: %s", raw[:2000])
    return parse_synthesis_response(raw, chunks)


def parse_synthesis_response(raw: str, chunks: list[RetrievedChunk] | None = None) -> SynthesisResult:
    """Parse and sanitize the LLM's response.

    First tries markdown bullet parsing with [ChunkID: N] citations.
    If citations are missing, attempts to recover them by matching item text
    against the provided chunks. Falls back to JSON parsing if the response
    looks like JSON.
    """
    if not raw or not raw.strip():
        return SynthesisResult(no_relevant_info=True)

    stripped = raw.strip()

    # If the response explicitly says no relevant info, honor it.
    if "I could not find any relevant information" in stripped:
        return SynthesisResult(no_relevant_info=True)

    # Try markdown bullet parsing first.
    items = _parse_markdown_items(stripped, chunks)
    if items:
        items = _deduplicate_same_chunk_items(items)
        return SynthesisResult(items=items)

    # Fallback: try JSON parsing (legacy/well-behaved LLMs).
    json_items = _try_parse_json(stripped)
    if json_items is not None:
        return json_items

    logger.warning("Could not parse LLM response. Falling back to RAW. Response: %s", raw[:500])
    return SynthesisResult(no_relevant_info=True)


def _parse_markdown_items(raw: str, chunks: list[RetrievedChunk] | None = None) -> list[AnswerItem]:
    """Parse markdown bullet points with [ChunkID: N] citations.

    If an item has no citation, attempts to recover the best-matching chunk
    from the provided context. Items that cannot be matched are dropped.
    """
    items: list[AnswerItem] = []
    # Preprocess lazy LLM output that concatenates numbered items on one line
    # without separators (e.g. "1 Foo. 2Bar. 3Baz."). Split those into real lines.
    preprocessed = _split_concatenated_numbered_items(raw)
    # Match lines starting with - or * or numbered like 1.
    for line in preprocessed.splitlines():
        line = line.strip()
        if not line:
            continue
        # Skip headers, code fences, and other markdown noise.
        if line.startswith("#") or line.startswith("```"):
            continue
        # Match bullet or numbered item.
        match = re.match(r"^(?:[-*]|\d+\.?)\s+(.+)$", line)
        if not match:
            continue
        text = match.group(1).strip()
        if not text:
            continue

        # Extract chunk IDs from [ChunkID: N] or [ChunkID: N, M] citations.
        chunk_ids: list[int] = []
        for citation in re.findall(r"\[ChunkID:\s*([^\]]+)\]", text):
            for part in citation.split(","):
                part = part.strip()
                try:
                    chunk_ids.append(int(part))
                except (ValueError, TypeError):
                    continue

        # Remove the citation markers from the text.
        clean_text = re.sub(r"\[ChunkID:\s*[^\]]+\]", "", text).strip()
        # Collapse multiple spaces left by removed citations.
        clean_text = re.sub(r"\s{2,}", " ", clean_text).strip()

        if not clean_text:
            continue

        # If the LLM omitted citations, try to recover from chunk text overlap.
        if not chunk_ids and chunks:
            recovered_id = _best_matching_chunk_id(clean_text, chunks)
            if recovered_id is not None:
                chunk_ids = [recovered_id]

        if chunk_ids:
            items.append(AnswerItem(text=clean_text, chunk_ids=chunk_ids, confidence="medium"))

    return items


def _split_concatenated_numbered_items(raw: str) -> str:
    """Split lazy LLM output like "1 Foo. 2Bar. 3Baz." into separate lines.

    Some models emit a numbered list as a single run-on paragraph where each
    item starts with a digit immediately followed by an uppercase word. Without
    this preprocessing the markdown parser only sees the first item.
    """
    # If the response already contains newlines, trust it.
    if "\n" in raw.strip():
        return raw
    # Split before every digit+uppercase transition that is preceded by a
    # non-digit character. This turns "1 Foo. 2Bar." into ["1 Foo.", "2Bar."].
    parts = re.split(r"(?<=\D)(?=\d+[A-Z])", raw)
    lines: list[str] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        # Normalize "2Bar" to "2. Bar" so the markdown regex can parse it.
        normalized = re.sub(r"^(\d+)([A-Z])", r"\1. \2", part)
        lines.append(normalized)
    return "\n".join(lines)


def _best_matching_chunk_id(text: str, chunks: list[RetrievedChunk]) -> int | None:
    """Return the chunk ID whose text has the highest word overlap with the item."""
    text_words = set(re.findall(r"\b\w+\b", text.lower()))
    if not text_words:
        return None

    best_id: int | None = None
    best_score = 0.0
    for chunk in chunks:
        chunk_words = set(re.findall(r"\b\w+\b", chunk.text.lower()))
        if not chunk_words:
            continue
        overlap = len(text_words & chunk_words)
        # Normalize by the item's word count. A chunk may be much larger than
        # the item, so dividing by the smaller set would inflate the score.
        # We want to know what fraction of the item's words appear in the chunk.
        score = overlap / len(text_words)
        if score > best_score:
            best_score = score
            best_id = chunk.chunk_id

    # Require a minimum overlap to avoid assigning invented text to a random chunk.
    # The threshold is low because a single retrieved chunk can contain many
    # distinct facts (e.g. a list of five comics on one page), so each item
    # may only share a few words with the chunk.
    if best_score >= 0.05:
        return best_id
    return None


def _deduplicate_same_chunk_items(items: list[AnswerItem]) -> list[AnswerItem]:
    """Merge consecutive items that are near-duplicate fragments of one fact.

    A common hallucination pattern is the LLM repeating the same fact with
    minor wording changes across multiple numbered items to satisfy a count
    request. This merges consecutive items that cite the same single chunk AND
    whose text is highly similar (>= 70% word overlap), which indicates they
    are reworded duplicates rather than distinct facts.

    Distinct items that merely share a source chunk (e.g. five different
    comics listed on one page) are preserved as separate list items.
    """
    if len(items) <= 1:
        return items
    if not items:
        return items

    deduped: list[AnswerItem] = []
    current_run: list[AnswerItem] = [items[0]]

    for item in items[1:]:
        last = current_run[-1]
        same_single_chunk = (
            len(last.chunk_ids) == 1
            and len(item.chunk_ids) == 1
            and last.chunk_ids[0] == item.chunk_ids[0]
        )
        if same_single_chunk and _text_overlap_ratio(last.text, item.text) >= 0.7:
            current_run.append(item)
        else:
            deduped.append(_merge_item_run(current_run))
            current_run = [item]

    deduped.append(_merge_item_run(current_run))
    return deduped


def _text_overlap_ratio(a: str, b: str) -> float:
    """Return the Jaccard word-overlap ratio between two item texts.

    A high ratio means the two items are near-duplicates (reworded versions of
    the same fact). A low ratio means they are distinct facts.
    """
    words_a = set(re.findall(r"\b\w+\b", a.lower()))
    words_b = set(re.findall(r"\b\w+\b", b.lower()))
    if not words_a or not words_b:
        return 0.0
    return len(words_a & words_b) / len(words_a | words_b)


def _merge_item_run(run: list[AnswerItem]) -> AnswerItem:
    """Merge a run of items into a single item."""
    if len(run) == 1:
        return run[0]
    merged_text = " ".join(item.text.strip() for item in run if item.text.strip())
    # Keep the original chunk IDs (they are all the same) and the lowest confidence.
    confidence = min((item.confidence for item in run), key=lambda c: {"high": 0, "medium": 1, "low": 2}.get(c, 1))
    return AnswerItem(text=merged_text, chunk_ids=run[0].chunk_ids, confidence=confidence)


def _try_parse_json(raw: str) -> SynthesisResult | None:
    """Attempt to parse a JSON response. Returns None if parsing fails."""
    # Try to extract JSON from ```json ... ``` fences.
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", raw, re.DOTALL)
    if fenced:
        raw = fenced.group(1)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        repaired = _repair_json(raw)
        try:
            data = json.loads(repaired)
        except json.JSONDecodeError:
            return None

    if not isinstance(data, dict):
        return None

    if data.get("no_relevant_info"):
        return SynthesisResult(no_relevant_info=True)

    items: list[AnswerItem] = []
    for raw_item in data.get("items", []):
        if not isinstance(raw_item, dict):
            continue
        text = str(raw_item.get("text", "")).strip()
        chunk_ids = _to_int_list(raw_item.get("chunk_ids", []))
        confidence = _normalize_confidence(raw_item.get("confidence", "medium"))
        if text and chunk_ids:
            items.append(AnswerItem(text=text, chunk_ids=chunk_ids, confidence=confidence))

    summary = data.get("summary")
    if summary:
        summary = str(summary).strip()

    return SynthesisResult(items=items, summary=summary)


def _to_int_list(value) -> list[int]:
    """Coerce a value to a list of ints."""
    if isinstance(value, int):
        return [value]
    if isinstance(value, list):
        result = []
        for v in value:
            try:
                result.append(int(v))
            except (ValueError, TypeError):
                pass
        return result
    return []


def _normalize_confidence(value) -> str:
    value = str(value).lower().strip()
    if value in ("high", "medium", "low"):
        return value
    return "medium"


def _repair_json(raw: str) -> str:
    """Minimal JSON repair: strip leading/trailing non-JSON text."""
    # Find the first '{' and last '}'
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        return raw[start : end + 1]
    return raw
