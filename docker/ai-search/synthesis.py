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

For every fact or item in your answer, cite the ChunkID(s) from the Context that support it using the exact format [ChunkID: N] inline at the end of the item.

Return your answer as markdown bullet points. Use this format:
- Concise fact or item text. [ChunkID: 42]
- Another item text. [ChunkID: 43]

Rules:
- If the Context contains chunks, you MUST return at least one item citing a ChunkID. Do not say you could not find information just because the answer is partial or the query asks for a list.
- Only say "I could not find any relevant information for this search." if the Context is literally empty or completely unrelated.
- Each item must have at least one [ChunkID: N] citation from the Context.
- Do not include information that is not supported by the Context.
- Keep item text concise and grounded in the Context.
- The user asked for up to {requested_count} items, but you must NOT invent items to reach that number. Only return items that are directly supported by the Context. If the Context supports fewer items, return fewer.
- Do NOT split a single chunk into multiple numbered items. If one chunk contains several related facts, return them as ONE item or pick the single most relevant fact.
- Each item should ideally cite a different chunk. Multiple items citing the same single chunk are a sign you are inventing a list.
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
    generate_fn: Callable[[str, str, int, float, list[dict] | None], str],
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
        raw = generate_fn(query.raw, context, max_tokens, temperature, chat_history)
    except Exception as e:
        logger.error("LLM generation failed: %s", e)
        return SynthesisResult(no_relevant_info=True)

    logger.debug("Raw LLM synthesis response: %s", raw[:2000])
    return parse_synthesis_response(raw)


def parse_synthesis_response(raw: str) -> SynthesisResult:
    """Parse and sanitize the LLM's response.

    First tries markdown bullet parsing with [ChunkID: N] citations.
    Falls back to JSON parsing if the response looks like JSON.
    """
    if not raw or not raw.strip():
        return SynthesisResult(no_relevant_info=True)

    stripped = raw.strip()

    # If the response explicitly says no relevant info, honor it.
    if "I could not find any relevant information" in stripped:
        return SynthesisResult(no_relevant_info=True)

    # Try markdown bullet parsing first.
    items = _parse_markdown_items(stripped)
    if items:
        items = _deduplicate_same_chunk_items(items)
        return SynthesisResult(items=items)

    # Fallback: try JSON parsing (legacy/well-behaved LLMs).
    json_items = _try_parse_json(stripped)
    if json_items is not None:
        return json_items

    logger.warning("Could not parse LLM response. Falling back to RAW. Response: %s", raw[:500])
    return SynthesisResult(no_relevant_info=True)


def _parse_markdown_items(raw: str) -> list[AnswerItem]:
    """Parse markdown bullet points with [ChunkID: N] citations."""
    items: list[AnswerItem] = []
    # Match lines starting with - or * or numbered like 1.
    for line in raw.splitlines():
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

        if clean_text and chunk_ids:
            items.append(AnswerItem(text=clean_text, chunk_ids=chunk_ids, confidence="medium"))

    return items


def _deduplicate_same_chunk_items(items: list[AnswerItem]) -> list[AnswerItem]:
    """Merge consecutive items that all cite the same single chunk.

    This is a common hallucination pattern: the LLM splits one chunk into a
    numbered list to satisfy a count request. Merging them keeps the grounded
    facts together and prevents fake multiplicity.
    """
    if not items:
        return items

    deduped: list[AnswerItem] = []
    current_run: list[AnswerItem] = [items[0]]

    for item in items[1:]:
        last = current_run[-1]
        # Same single chunk on both items.
        if len(last.chunk_ids) == 1 and len(item.chunk_ids) == 1 and last.chunk_ids[0] == item.chunk_ids[0]:
            current_run.append(item)
        else:
            deduped.append(_merge_item_run(current_run))
            current_run = [item]

    deduped.append(_merge_item_run(current_run))
    return deduped


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
