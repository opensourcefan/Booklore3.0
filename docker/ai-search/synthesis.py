"""LLM synthesis stage.

Constructs a context block tagged with stable chunk IDs, asks the LLM for a
structured JSON response, and parses/validates that response.
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

For every fact or item in your answer, cite the ChunkID(s) from the Context that support it.
Return your answer as JSON with exactly this shape:
{{
  "items": [
    {{"text": "Concise fact or item text.", "chunk_ids": [42], "confidence": "high"}}
  ],
  "summary": "Optional one-sentence overall summary.",
  "no_relevant_info": false
}}

Rules:
- If the Context contains chunks, you MUST return at least one item citing a ChunkID. Do not return no_relevant_info=true just because the answer is partial or the query asks for a list.
- Only return {{"items": [], "no_relevant_info": true}} if the Context is literally empty or completely unrelated.
- Each item must have at least one chunk_id from the Context.
- Do not include information that is not supported by the Context.
- Keep item text concise and grounded in the Context.
- The user asked for up to {requested_count} items, but you must NOT invent items to reach that number. Only return items that are directly supported by the Context. If the Context supports fewer items, return fewer.
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
    """Call the LLM and parse the structured JSON response.

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
    """Parse and sanitize the LLM's JSON response.

    Tries to extract JSON from markdown code fences, then validates the shape.
    """
    # Try to extract JSON from ```json ... ``` fences.
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", raw, re.DOTALL)
    if fenced:
        raw = fenced.group(1)

    # If the response is not valid JSON, attempt to repair common issues.
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        repaired = _repair_json(raw)
        try:
            data = json.loads(repaired)
        except json.JSONDecodeError:
            logger.warning("Could not parse LLM response as JSON. Falling back to RAW. Response: %s", raw[:500])
            return SynthesisResult(no_relevant_info=True)

    if not isinstance(data, dict):
        return SynthesisResult(no_relevant_info=True)

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
