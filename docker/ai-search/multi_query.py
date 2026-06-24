"""Multi-Query Retrieval stage.

Generates multiple rephrased versions of the user's query, retrieves chunks
for each variant, and fuses the results using Reciprocal Rank Fusion (RRF).
This improves recall by capturing different phrasings of the same intent.

When the LLM provider is local, multi-query is automatically disabled to avoid
the extra LLM call overhead on CPU-bound small models.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from models import ParsedQuery, RetrievedChunk

logger = logging.getLogger("fable-ai-search")

_MULTI_QUERY_SYSTEM_PROMPT = (
    "You are a helpful assistant. Your task is to generate {num_variants} different "
    "rephrasings of the user's question. Each rephrasing should capture the same "
    "intent but use different words, perspectives, or levels of specificity.\n\n"
    "Return ONLY the rephrased questions, one per line, with no numbering, "
    "no bullet points, and no additional text."
)


def generate_query_variants(
    query: ParsedQuery,
    generate_fn: Callable[[str, str, int, float, list[dict] | None, str | None], str],
    num_variants: int = 3,
    max_tokens: int = 256,
    temperature: float = 0.7,
) -> list[str]:
    """Generate rephrased variants of the query.

    Args:
        query: Parsed query.
        generate_fn: LLM generation function.
        num_variants: Number of variants to generate.
        max_tokens: Max tokens for generation.
        temperature: Temperature (higher = more diverse variants).

    Returns:
        List of query variant strings (including the original).
    """
    system_prompt = _MULTI_QUERY_SYSTEM_PROMPT.format(num_variants=num_variants)

    try:
        raw = generate_fn(
            query=query.raw,
            context="",
            max_tokens=max_tokens,
            temperature=temperature,
            chat_history=None,
            system_prompt=system_prompt,
        )
        if not raw or not raw.strip():
            logger.warning("Multi-query generation returned empty response")
            return [query.embedding_text]

        variants: list[str] = []
        for line in raw.strip().split("\n"):
            line = line.strip()
            # Skip empty lines, numbering, bullet markers
            if not line:
                continue
            # Strip common prefixes like "1.", "-", "*"
            while line and (line[0].isdigit() or line[0] in "-*.#"):
                if line[0].isdigit():
                    # Strip "1. " or "1) "
                    idx = 0
                    while idx < len(line) and line[idx].isdigit():
                        idx += 1
                    if idx < len(line) and line[idx] in ".):":
                        idx += 1
                    line = line[idx:].strip()
                else:
                    line = line[1:].strip()
            if line and len(line) > 5:
                variants.append(line)

        if not variants:
            logger.warning("Multi-query parsing produced no valid variants")
            return [query.embedding_text]

        # Include the original query as the first variant
        all_variants = [query.embedding_text] + variants[:num_variants]
        logger.info(
            "Multi-query generated %d variants (including original) for query: %s",
            len(all_variants), query.raw[:80],
        )
        return all_variants

    except Exception as e:
        logger.error("Multi-query generation failed: %s", e)
        return [query.embedding_text]


def multi_query_retrieve(
    query: ParsedQuery,
    retrieve_fn: Callable[..., tuple[list[RetrievedChunk], int]],
    generate_fn: Callable[[str, str, int, float, list[dict] | None, str | None], str],
    book_ids: list[int] | None,
    user_id: int,
    top_k: int,
    num_variants: int = 3,
    rrf_k: int = 60,
) -> tuple[list[RetrievedChunk], int]:
    """Retrieve chunks using multiple query variants and fuse with RRF.

    Args:
        query: Parsed query.
        retrieve_fn: Standard retrieval function.
        generate_fn: LLM generation function for variant generation.
        book_ids: Optional book scope.
        user_id: User ID.
        top_k: Number of results per variant.
        num_variants: Number of query variants to generate.
        rrf_k: RRF constant for fusion.

    Returns:
        Tuple of (fused ranked chunks, total chunks searched).
    """
    variants = generate_query_variants(query, generate_fn, num_variants)

    if len(variants) <= 1:
        # Only the original query — fall back to standard retrieval
        return retrieve_fn(
            embedding_text=query.embedding_text,
            book_ids=book_ids,
            user_id=user_id,
            top_k=top_k,
        )

    # Retrieve for each variant
    all_results: dict[int, list[RetrievedChunk]] = {}
    total_searched = 0
    for variant in variants:
        try:
            chunks, searched = retrieve_fn(
                embedding_text=variant,
                book_ids=book_ids,
                user_id=user_id,
                top_k=top_k,
            )
            all_results[variant] = chunks
            total_searched = max(total_searched, searched)
        except Exception as e:
            logger.warning("Multi-query retrieval failed for variant '%s': %s", variant[:80], e)

    if not all_results:
        return [], 0

    # RRF fusion across all variant result sets
    rrf_scores: dict[int, float] = {}
    chunk_by_id: dict[int, RetrievedChunk] = {}

    for variant_chunks in all_results.values():
        for rank, chunk in enumerate(variant_chunks):
            rrf_scores[chunk.chunk_id] = rrf_scores.get(chunk.chunk_id, 0.0) + 1.0 / (rrf_k + rank + 1)
            if chunk.chunk_id not in chunk_by_id:
                chunk_by_id[chunk.chunk_id] = chunk

    # Sort by RRF score descending
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
        "Multi-query RRF fusion: %d variants -> %d unique chunks -> %d final results",
        len(variants), len(rrf_scores), len(fused),
    )
    return fused, total_searched


def should_use_multi_query(llm_provider: str, multi_query_enabled: bool) -> bool:
    """Determine whether multi-query retrieval should be used.

    Multi-query adds extra LLM calls, so it is automatically disabled when using
    a local provider to avoid excessive latency on CPU-bound small models.
    """
    if not multi_query_enabled:
        return False
    if llm_provider == "local":
        logger.info("Multi-query disabled: local LLM provider detected (extra LLM calls would be too slow)")
        return False
    return True
