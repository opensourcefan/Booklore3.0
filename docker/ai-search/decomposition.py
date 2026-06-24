"""Query Decomposition stage.

Breaks complex multi-part queries into simpler sub-queries, retrieves chunks
for each sub-query, and fuses the results. This improves handling of compound
questions like "What comics feature time travel AND were published after 2000?"

When the LLM provider is local, query decomposition is automatically disabled
to avoid the extra LLM call overhead on CPU-bound small models.
"""

from __future__ import annotations

import logging
from typing import Callable

from models import ParsedQuery, RetrievedChunk

logger = logging.getLogger("fable-ai-search")

_DECOMPOSE_SYSTEM_PROMPT = (
    "You are a helpful assistant. Break down the user's complex question into "
    "simpler, independent sub-questions that can be answered separately.\n\n"
    "Rules:\n"
    "- Return ONLY the sub-questions, one per line.\n"
    "- No numbering, no bullet points, no additional text.\n"
    "- Each sub-question should be self-contained and answerable on its own.\n"
    "- If the question is already simple, return it unchanged.\n"
    "- Generate at most 4 sub-questions."
)


def decompose_query(
    query: ParsedQuery,
    generate_fn: Callable[[str, str, int, float, list[dict] | None, str | None], str],
    max_tokens: int = 256,
    temperature: float = 0.3,
) -> list[str]:
    """Decompose a complex query into simpler sub-queries.

    Args:
        query: Parsed query.
        generate_fn: LLM generation function.
        max_tokens: Max tokens for generation.
        temperature: Temperature for generation.

    Returns:
        List of sub-query strings (at minimum, the original query).
    """
    try:
        raw = generate_fn(
            query=query.raw,
            context="",
            max_tokens=max_tokens,
            temperature=temperature,
            chat_history=None,
            system_prompt=_DECOMPOSE_SYSTEM_PROMPT,
        )
        if not raw or not raw.strip():
            return [query.embedding_text]

        sub_queries: list[str] = []
        for line in raw.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            # Strip common prefixes
            while line and (line[0].isdigit() or line[0] in "-*.#"):
                if line[0].isdigit():
                    idx = 0
                    while idx < len(line) and line[idx].isdigit():
                        idx += 1
                    if idx < len(line) and line[idx] in ".):":
                        idx += 1
                    line = line[idx:].strip()
                else:
                    line = line[1:].strip()
            if line and len(line) > 5:
                sub_queries.append(line)

        if not sub_queries:
            return [query.embedding_text]

        logger.info(
            "Query decomposition: %d sub-queries from '%s'",
            len(sub_queries), query.raw[:80],
        )
        return sub_queries

    except Exception as e:
        logger.error("Query decomposition failed: %s", e)
        return [query.embedding_text]


def decomposed_retrieve(
    query: ParsedQuery,
    retrieve_fn: Callable[..., tuple[list[RetrievedChunk], int]],
    generate_fn: Callable[[str, str, int, float, list[dict] | None, str | None], str],
    book_ids: list[int] | None,
    user_id: int,
    top_k: int,
    rrf_k: int = 60,
) -> tuple[list[RetrievedChunk], int]:
    """Retrieve chunks for each sub-query and fuse with RRF.

    Args:
        query: Parsed query.
        retrieve_fn: Standard retrieval function.
        generate_fn: LLM generation function for decomposition.
        book_ids: Optional book scope.
        user_id: User ID.
        top_k: Number of results per sub-query.
        rrf_k: RRF constant for fusion.

    Returns:
        Tuple of (fused ranked chunks, total chunks searched).
    """
    sub_queries = decompose_query(query, generate_fn)

    if len(sub_queries) <= 1:
        return retrieve_fn(
            embedding_text=query.embedding_text,
            book_ids=book_ids,
            user_id=user_id,
            top_k=top_k,
        )

    # Retrieve for each sub-query
    all_results: dict[str, list[RetrievedChunk]] = {}
    total_searched = 0
    for sub_q in sub_queries:
        try:
            chunks, searched = retrieve_fn(
                embedding_text=sub_q,
                book_ids=book_ids,
                user_id=user_id,
                top_k=top_k,
            )
            all_results[sub_q] = chunks
            total_searched = max(total_searched, searched)
        except Exception as e:
            logger.warning("Decomposed retrieval failed for sub-query '%s': %s", sub_q[:80], e)

    if not all_results:
        return [], 0

    # RRF fusion
    rrf_scores: dict[int, float] = {}
    chunk_by_id: dict[int, RetrievedChunk] = {}

    for sub_chunks in all_results.values():
        for rank, chunk in enumerate(sub_chunks):
            rrf_scores[chunk.chunk_id] = rrf_scores.get(chunk.chunk_id, 0.0) + 1.0 / (rrf_k + rank + 1)
            if chunk.chunk_id not in chunk_by_id:
                chunk_by_id[chunk.chunk_id] = chunk

    sorted_ids = sorted(rrf_scores.keys(), key=lambda cid: rrf_scores[cid], reverse=True)
    fused = []
    for rank, cid in enumerate(sorted_ids[:top_k]):
        chunk = chunk_by_id[cid]
        fused.append(RetrievedChunk(
            chunk_id=chunk.chunk_id,
            book_id=chunk.book_id,
            book_title=chunk.book_title,
            chunk_index=chunk.chunk_index,
            text=chunk.text,
            page_number=chunk.page_number,
            chapter_title=chunk.chapter_title,
            context_before=chunk.context_before,
            context_after=chunk.context_after,
            similarity=chunk.similarity,
            bm25_score=chunk.bm25_score,
            rerank_score=chunk.rerank_score,
            rrf_score=round(rrf_scores[cid], 6),
            rank=rank + 1,
        ))

    logger.info(
        "Decomposed retrieval: %d sub-queries -> %d unique chunks -> %d final results",
        len(sub_queries), len(rrf_scores), len(fused),
    )
    return fused, total_searched


def should_use_decomposition(llm_provider: str, decomposition_enabled: bool) -> bool:
    """Determine whether query decomposition should be used.

    Decomposition adds an extra LLM call, so it is automatically disabled when
    using a local provider to avoid excessive latency on CPU-bound small models.
    """
    if not decomposition_enabled:
        return False
    if llm_provider == "local":
        logger.info("Query decomposition disabled: local LLM provider detected (extra LLM call would be too slow)")
        return False
    return True
