"""AI Search pipeline orchestrator.

This module wires together the stages of the new pipeline:
  query parsing -> retrieval -> chunk filtering -> synthesis -> citation validation -> disclaimer -> response assembly.

It is designed to be called from the existing /v1/search route in app.py.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from models import (
    Chunk,
    ParsedQuery,
    RetrievedChunk,
    SearchResponse,
    ValidatedAnswerItem,
)
from query_parser import parse_query
from chunk_filter import apply_chunk_filter
from synthesis import synthesize, SynthesisResult
from citation import validate_answer_items, render_answer_markdown, source_marker
from disclaimer import build_disclaimer

logger = logging.getLogger("fable-ai-search")


def run_search_pipeline(
    query: str,
    book_ids: list[int] | None,
    user_id: int,
    retrieve_fn: Callable[..., tuple[list[RetrievedChunk], int]],
    generate_fn: Callable[[str, str, int, float, list[dict] | None], str],
    top_k: int = 5,
    display_top_k: int | None = None,
    max_tokens: int = 768,
    temperature: float = 0.1,
    chat_history: list[dict] | None = None,
    local_only: bool = False,
    strict_chunk_filter: bool = False,
) -> SearchResponse:
    """Run the new AI Search pipeline end-to-end.

    Args:
        query: Raw user query.
        book_ids: Optional list of book IDs to scope the search.
        user_id: User ID.
        retrieve_fn: Function that performs retrieval. Signature:
            retrieve_fn(query_embedding_text, book_ids, user_id, top_k, settings) -> (retrieved_chunks, total_chunks_searched)
        generate_fn: LLM generation function (matches existing _generate_answer signature).
        top_k: Retrieval pool size.
        display_top_k: Number of results to return to the UI (defaults to top_k).
        max_tokens: LLM max tokens.
        temperature: LLM temperature.
        chat_history: Optional previous turns.
        local_only: If True, skip LLM synthesis and return RAW results.
        strict_chunk_filter: If True, apply stricter chunk quality filtering.

    Returns:
        SearchResponse compatible with the existing /v1/search API.
    """
    parsed = parse_query(query)
    display_top_k = display_top_k if display_top_k is not None else top_k

    # For list queries, retrieve a larger pool so the LLM has more candidates
    # to choose from while still returning only display_top_k to the UI.
    retrieval_top_k = top_k
    if parsed.intent == "list" and parsed.requested_count is not None:
        retrieval_top_k = max(top_k, parsed.requested_count * 3)

    # Retrieval
    retrieved, total_chunks_searched = retrieve_fn(
        embedding_text=parsed.embedding_text,
        book_ids=book_ids,
        user_id=user_id,
        top_k=retrieval_top_k,
    )
    logger.info(
        "Retrieved %d chunks (searched %d) for query: %s",
        len(retrieved), total_chunks_searched, query,
    )

    # Chunk quality filter
    filter_result = apply_chunk_filter(retrieved, strict=strict_chunk_filter)
    filtered_chunks = filter_result.kept
    if filter_result.reason == "safety_valve":
        logger.info("Chunk filter safety valve engaged; using all %d retrieved chunks.", len(retrieved))

    # Build display results from the filtered retrieval pool.
    display_chunks = filtered_chunks[:display_top_k]

    # Synthesis
    validated_items: list[ValidatedAnswerItem] = []
    synthesis_result = SynthesisResult(no_relevant_info=True)
    if not local_only and filtered_chunks:
        synthesis_result = synthesize(
            query=parsed,
            chunks=filtered_chunks,
            generate_fn=generate_fn,
            max_tokens=max_tokens,
            temperature=temperature,
            chat_history=chat_history,
            requested_count=parsed.requested_count,
        )
        validated_items = validate_answer_items(synthesis_result.items, filtered_chunks)
        logger.info(
            "Synthesis produced %d validated items (no_relevant_info=%s) for query: %s",
            len(validated_items), synthesis_result.no_relevant_info, query,
        )

    # Determine final answer and results.
    final_results = [chunk_to_dict(c) for c in display_chunks]
    answer: str | None = None
    if local_only:
        if display_chunks:
            answer = "\n\n".join(
                f"{c.text}\n{source_marker(c)}" for c in display_chunks
            )
    elif validated_items:
        answer = render_answer_markdown(validated_items)
    elif display_chunks:
        # Synthesis failed or LLM claimed no relevant info, but we still have
        # retrieved chunks. Show them as a fallback with a disclaimer rather than
        # wiping the results.
        answer = "\n\n".join(
            f"{c.text}\n{source_marker(c)}" for c in display_chunks
        )

    # Disclaimer
    disclaimer = build_disclaimer(parsed, validated_items, display_chunks)

    if disclaimer and answer:
        answer = disclaimer + "\n\n" + answer
    elif disclaimer and local_only:
        answer = disclaimer + (f"\n\n{answer}" if answer else "")

    return SearchResponse(
        query=query,
        results=final_results,
        answer=answer,
        answer_items=[_validated_item_to_dict(item) for item in validated_items] if validated_items else None,
        total_chunks_searched=total_chunks_searched,
    )


def chunk_to_dict(chunk: Chunk | RetrievedChunk) -> dict[str, Any]:
    """Convert a Chunk model to the legacy dict shape expected by the UI."""
    result: dict[str, Any] = {
        "chunkId": chunk.chunk_id,
        "bookId": chunk.book_id,
        "bookTitle": chunk.book_title,
        "chunkIndex": chunk.chunk_index,
        "chunkText": chunk.text,
        "pageNumber": chunk.page_number,
        "chapterTitle": chunk.chapter_title,
    }
    if chunk.similarity is not None:
        result["similarity"] = chunk.similarity
    if chunk.context_before is not None:
        result["contextBefore"] = chunk.context_before
    if chunk.context_after is not None:
        result["contextAfter"] = chunk.context_after
    return result


def _validated_item_to_dict(item: ValidatedAnswerItem) -> dict[str, Any]:
    return {
        "text": item.text,
        "source": source_marker(item.primary_chunk),
        "bookTitle": item.primary_chunk.book_title,
        "pageNumber": item.primary_chunk.page_number,
        "chunkIds": [c.chunk_id for c in [item.primary_chunk] + item.supporting_chunks],
        "confidence": item.confidence,
    }
