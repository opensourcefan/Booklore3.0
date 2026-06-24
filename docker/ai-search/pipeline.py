"""AI Search pipeline orchestrator.

This module wires together the stages of the new pipeline:
  adaptive routing -> query parsing -> (HyDE | multi-query | decomposition) ->
  retrieval -> contextual compression -> chunk filtering -> synthesis ->
  self-reflection -> citation validation -> disclaimer -> response assembly.

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
    generate_fn: Callable[[str, str, int, float, list[dict] | None, str | None], str],
    top_k: int = 5,
    display_top_k: int | None = None,
    max_tokens: int = 768,
    temperature: float = 0.1,
    chat_history: list[dict] | None = None,
    local_only: bool = False,
    strict_chunk_filter: bool = False,
    # New RAG technique flags
    hyde_enabled: bool = False,
    multi_query_enabled: bool = False,
    decomposition_enabled: bool = False,
    reflection_enabled: bool = False,
    compression_enabled: bool = False,
    llm_provider: str = "local",
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
        hyde_enabled: Whether HyDE is enabled.
        multi_query_enabled: Whether multi-query retrieval is enabled.
        decomposition_enabled: Whether query decomposition is enabled.
        reflection_enabled: Whether self-reflection is enabled.
        compression_enabled: Whether contextual compression is enabled.
        llm_provider: LLM provider type (local/openai/ollama).

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

    # ---- Stage 0: Adaptive Routing ----
    # Determine which strategies to apply based on query characteristics.
    # LLM-call strategies are auto-disabled for local providers.
    can_use_llm = llm_provider != "local"
    effective_hyde = hyde_enabled and can_use_llm
    effective_multi_query = multi_query_enabled and can_use_llm
    effective_decomposition = decomposition_enabled and can_use_llm
    effective_reflection = reflection_enabled and can_use_llm

    from adaptive_routing import route_query, RouteStrategy
    strategies = route_query(
        query=parsed,
        hyde_enabled=effective_hyde,
        multi_query_enabled=effective_multi_query,
        decomposition_enabled=effective_decomposition,
        llm_provider=llm_provider,
    )

    # ---- Stage 1: HyDE (Hypothetical Document Embeddings) ----
    embedding_text = parsed.embedding_text
    if RouteStrategy.HYDE in strategies:
        from hyde import generate_hypothetical_document
        hypo = generate_hypothetical_document(
            query=parsed,
            generate_fn=generate_fn,
            max_tokens=min(256, max_tokens),
            temperature=0.3,
        )
        if hypo:
            embedding_text = hypo
            logger.info("HyDE: using hypothetical document as embedding text (%d chars)", len(hypo))

    # ---- Stage 2: Retrieval (with optional multi-query or decomposition) ----
    if RouteStrategy.DECOMPOSITION in strategies:
        from decomposition import decomposed_retrieve
        retrieved, total_chunks_searched = decomposed_retrieve(
            query=parsed,
            retrieve_fn=retrieve_fn,
            generate_fn=generate_fn,
            book_ids=book_ids,
            user_id=user_id,
            top_k=retrieval_top_k,
        )
    elif RouteStrategy.MULTI_QUERY in strategies:
        from multi_query import multi_query_retrieve
        retrieved, total_chunks_searched = multi_query_retrieve(
            query=parsed,
            retrieve_fn=retrieve_fn,
            generate_fn=generate_fn,
            book_ids=book_ids,
            user_id=user_id,
            top_k=retrieval_top_k,
        )
    else:
        # Standard retrieval
        retrieved, total_chunks_searched = retrieve_fn(
            embedding_text=embedding_text,
            book_ids=book_ids,
            user_id=user_id,
            top_k=retrieval_top_k,
        )

    logger.info(
        "Retrieved %d chunks (searched %d) for query: %s",
        len(retrieved), total_chunks_searched, query,
    )

    # ---- Stage 3: Contextual Compression ----
    if compression_enabled and retrieved:
        from compression import compress_chunks
        retrieved = compress_chunks(
            chunks=retrieved,
            query_text=parsed.embedding_text,
            compression_ratio=0.5,
            min_sentences=2,
        )
        logger.info("Contextual compression applied to %d chunks", len(retrieved))

    # ---- Stage 4: Chunk quality filter ----
    filter_result = apply_chunk_filter(retrieved, strict=strict_chunk_filter)
    filtered_chunks = filter_result.kept
    if filter_result.reason == "safety_valve":
        logger.info("Chunk filter safety valve engaged; using all %d retrieved chunks.", len(retrieved))

    # Build display results from the filtered retrieval pool.
    display_chunks = filtered_chunks[:display_top_k]

    # ---- Stage 5: Synthesis ----
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
        if not synthesis_result.sentinel_triggered:
            validated_items = validate_answer_items(synthesis_result.items, filtered_chunks)
            logger.info(
                "Synthesis produced %d validated items (no_relevant_info=%s) for query: %s",
                len(validated_items), synthesis_result.no_relevant_info, query,
            )

    # ---- Stage 6: Self-Reflection ----
    if effective_reflection and validated_items and not local_only:
        from reflection import reflect_on_answer
        reflection = reflect_on_answer(
            query=parsed,
            answer_items=synthesis_result.items,
            chunks=filtered_chunks,
            generate_fn=generate_fn,
            max_tokens=min(256, max_tokens),
            temperature=0.1,
        )
        if reflection.get("has_issues"):
            logger.info(
                "Self-reflection found %d issues, regenerating answer with stricter instructions",
                len(reflection.get("issues", [])),
            )
            # Regenerate with stricter system prompt
            strict_system_prompt = (
                "You are an AI search assistant. Answer ONLY from the provided Context.\n"
                "Do not use external knowledge. Do not invent facts. Be extremely careful.\n"
                "The previous answer had issues: " + "; ".join(reflection.get("issues", [])) + "\n"
                "Return your answer as markdown bullet points. For each item, cite the ChunkID from the Context that supports it using the exact format [ChunkID: N] at the end of the line.\n"
                "Only say 'I could not find any relevant information for this search.' if the Context is literally empty or completely unrelated."
            )
            retry_result = synthesize(
                query=parsed,
                chunks=filtered_chunks,
                generate_fn=generate_fn,
                max_tokens=max_tokens,
                temperature=min(temperature, 0.05),  # Lower temperature for retry
                chat_history=chat_history,
                requested_count=parsed.requested_count,
            )
            if not retry_result.sentinel_triggered and retry_result.items:
                synthesis_result = retry_result
                validated_items = validate_answer_items(synthesis_result.items, filtered_chunks)
                logger.info(
                    "Self-reflection retry produced %d validated items",
                    len(validated_items),
                )

    # ---- Stage 7: Determine final answer and results ----
    if not local_only and synthesis_result.sentinel_triggered:
        display_chunks = []
        final_results = []
        answer = "I could not find any relevant information for this search."
    else:
        final_results = [chunk_to_dict(c) for c in display_chunks]
        answer = None
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

    # ---- Stage 8: Disclaimer ----
    disclaimer = build_disclaimer(parsed, validated_items, display_chunks)

    if disclaimer and answer:
        answer = disclaimer + "\n\n" + answer
    elif disclaimer and local_only:
        answer = disclaimer + (f"\n\n{answer}" if answer else "")

    return SearchResponse(
        query=query,
        results=final_results,
        context_results=[chunk_to_dict(c) for c in retrieved],
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
