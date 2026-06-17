"""Retrieval stage.

Performs vector similarity search, optional hybrid BM25 fusion (RRF), optional
cross-encoder reranking, and fetches adjacent chunks for context.

Dependencies (embedding model, DB pool, config globals) are passed in explicitly
so this module can be tested in isolation and so app.py remains the composition root.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable

from models import Chunk, RetrievedChunk

logger = logging.getLogger("fable-ai-search")


def retrieve(
    embedding_text: str,
    book_ids: list[int] | None,
    user_id: int,
    top_k: int,
    compute_embedding_fn: Callable[[str], list[float]],
    get_db_connection_fn: Callable,
    cosine_similarity_fn: Callable[[list[float], list[float]], float],
    similarity_threshold: float = 0.3,
    hybrid_search_enabled: bool = False,
    rrf_k: int = 60,
    reranking_enabled: bool = False,
    reranker_model: Any | None = None,
    matryoshka_dimensions: int = 0,
    required_phrases: list[str] | None = None,
    semantic_keywords: list[str] | None = None,
    is_index_request: bool = False,
) -> tuple[list[RetrievedChunk], int]:
    """Retrieve and rank candidate chunks for a query.

    Args:
        embedding_text: Text to embed for vector search.
        book_ids: Optional scope. If None/empty, searches all user's books.
        user_id: User ID.
        top_k: Number of top results to return.
        compute_embedding_fn: Function that computes an embedding vector.
        get_db_connection_fn: Function that returns a DB connection.
        cosine_similarity_fn: Function that computes cosine similarity.
        similarity_threshold: Minimum vector similarity.
        hybrid_search_enabled: Whether to fuse BM25 scores with RRF.
        rrf_k: RRF hyperparameter.
        reranking_enabled: Whether to apply cross-encoder reranking.
        reranker_model: Loaded cross-encoder model.
        matryoshka_dimensions: If > 0, truncate and re-normalize stored vectors.
        required_phrases: Exact phrases that must appear in a chunk (quoted query terms).
        is_index_request: If True, skip index/glossary heuristic filtering.

    Returns:
        Tuple of (ranked retrieved chunks, total chunks searched in DB).
    """
    semantic_keywords = semantic_keywords or []
    query_vector = compute_embedding_fn(embedding_text)

    conn = None
    cursor = None
    rows: list[dict] = []
    try:
        conn = get_db_connection_fn()
        cursor = conn.cursor(dictionary=True)

        if book_ids and len(book_ids) > 0:
            placeholders = ",".join(["%s"] * len(book_ids))
            cursor.execute(
                f"""SELECT be.id, be.book_id, be.user_id, be.chunk_index, be.chunk_text,
                           be.embedding_vector, be.page_number, be.chapter_title,
                           b.title as book_title
                    FROM book_embeddings be
                    JOIN book_metadata b ON b.book_id = be.book_id
                    WHERE be.user_id = %s AND be.book_id IN ({placeholders})""",
                [user_id] + list(book_ids),
            )
        else:
            cursor.execute(
                """SELECT be.id, be.book_id, be.user_id, be.chunk_index, be.chunk_text,
                          be.embedding_vector, be.page_number, be.chapter_title,
                          b.title as book_title
                   FROM book_embeddings be
                   JOIN book_metadata b ON b.book_id = be.book_id
                   WHERE be.user_id = %s""",
                (user_id,),
            )

        rows = cursor.fetchall()

        if not rows:
            return [], 0

        # Dimension mismatch check
        query_dim = len(query_vector)
        first_vector = None
        for row in rows:
            try:
                first_vector = json.loads(row["embedding_vector"])
                break
            except (json.JSONDecodeError, TypeError, ValueError):
                continue

        if first_vector is not None and len(first_vector) != query_dim:
            stored_dim = len(first_vector)
            raise EmbeddingDimensionMismatch(query_dim, stored_dim)

        # Build candidate documents
        documents: list[dict] = []
        row_map: dict[int, dict] = {}
        for row in rows:
            if not is_index_request:
                ch_title = (row["chapter_title"] or "").lower()
                text_prefix = row["chunk_text"][:200].lower()
                if "index" in ch_title or "table of contents" in ch_title or "glossary" in ch_title:
                    continue
                if "i n d e x" in text_prefix or "g l o s s a r y" in text_prefix:
                    continue
                words = text_prefix.split()
                numbers = [w for w in words if __import__("re").match(r'^\d+$', w)]
                if len(words) > 0 and (len(numbers) / len(words)) > 0.15:
                    continue

            if required_phrases:
                text_lower = row["chunk_text"].lower()
                title_lower = (row["chapter_title"] or "").lower()
                book_lower = (row["book_title"] or "").lower()
                if not all(kw.lower() in text_lower or kw.lower() in title_lower or kw.lower() in book_lower for kw in required_phrases):
                    continue

            doc = {
                "chunkId": row["id"],
                "bookId": row["book_id"],
                "bookTitle": row["book_title"],
                "chunkIndex": row["chunk_index"],
                "chunkText": row["chunk_text"],
                "pageNumber": row["page_number"],
                "chapterTitle": row["chapter_title"],
            }
            documents.append(doc)
            row_map[row["id"]] = row

        # Vector similarity
        scored_vector: list[dict] = []
        for doc in documents:
            try:
                row = row_map[doc["chunkId"]]
                vector = json.loads(row["embedding_vector"])
                if matryoshka_dimensions > 0 and len(vector) > matryoshka_dimensions:
                    import numpy as np
                    vector = vector[:matryoshka_dimensions]
                    norm = np.linalg.norm(vector)
                    if norm > 0:
                        vector = (vector / norm).tolist()

                similarity = cosine_similarity_fn(query_vector, vector)

                # Soft keyword boosting: favor chunks that contain query keywords.
                if semantic_keywords:
                    text_lower = doc["chunkText"].lower()
                    title_lower = (doc.get("chapterTitle") or "").lower()
                    book_lower = doc["bookTitle"].lower()
                    match_count = 0
                    for kw in semantic_keywords:
                        if kw in text_lower or kw in title_lower or kw in book_lower:
                            match_count += 1
                        elif kw.endswith("s") and len(kw) > 3 and kw[:-1] in text_lower:
                            match_count += 1
                    boost = min(0.10, match_count * 0.02)
                    similarity += boost

                if similarity >= similarity_threshold:
                    doc_copy = doc.copy()
                    doc_copy["similarity"] = round(similarity, 4)
                    scored_vector.append(doc_copy)
            except Exception:
                continue

        logger.info(
            "Vector similarity produced %d candidates above threshold %s (from %d documents) for query: %s",
            len(scored_vector), similarity_threshold, len(documents), embedding_text,
        )

        scored_vector.sort(key=lambda x: x["similarity"], reverse=True)

        candidates: list[dict] = []
        if hybrid_search_enabled:
            bm25_scores = _compute_bm25_scores(embedding_text, documents)
            scored_bm25: list[dict] = []
            for doc in documents:
                score = bm25_scores.get(doc["chunkId"], 0.0)
                if score > 0:
                    doc_copy = doc.copy()
                    doc_copy["bm25_score"] = score
                    scored_bm25.append(doc_copy)
            scored_bm25.sort(key=lambda x: x["bm25_score"], reverse=True)

            vector_ranks = {d["chunkId"]: r for r, d in enumerate(scored_vector)}
            bm25_ranks = {d["chunkId"]: r for r, d in enumerate(scored_bm25)}
            all_ids = set(vector_ranks.keys()) | set(bm25_ranks.keys())
            chunk_id_to_doc = {doc["chunkId"]: doc for doc in documents}

            for chunk_id in all_ids:
                score_vector = 1.0 / (rrf_k + vector_ranks[chunk_id]) if chunk_id in vector_ranks else 0.0
                score_bm25 = 1.0 / (rrf_k + bm25_ranks[chunk_id]) if chunk_id in bm25_ranks else 0.0
                rrf_score = score_vector + score_bm25
                doc_copy = chunk_id_to_doc[chunk_id].copy()
                doc_copy["rrf_score"] = round(rrf_score, 6)
                doc_copy["similarity"] = scored_vector[vector_ranks[chunk_id]]["similarity"] if chunk_id in vector_ranks else round(rrf_score, 4)
                candidates.append(doc_copy)

            candidates.sort(key=lambda x: x["rrf_score"], reverse=True)
        else:
            candidates = scored_vector

        # Reranking
        if reranking_enabled and reranker_model is not None:
            rerank_pool_size = min(20, max(top_k, top_k * 2))
            candidates_to_rerank = candidates[:rerank_pool_size]
            if candidates_to_rerank:
                try:
                    pairs = [[embedding_text, c["chunkText"]] for c in candidates_to_rerank]
                    scores = reranker_model.predict(pairs)
                    if hasattr(scores, "tolist"):
                        scores = scores.tolist()
                    if isinstance(scores, float):
                        scores = [scores]
                    for idx, score in enumerate(scores):
                        candidates_to_rerank[idx]["rerank_score"] = round(float(score), 4)
                    candidates_to_rerank.sort(key=lambda x: x["rerank_score"], reverse=True)
                    candidates = candidates_to_rerank + candidates[rerank_pool_size:]
                except Exception as e:
                    logger.error("Failed to run reranker: %s", e)

        top_results = candidates[:top_k]

        # Fetch adjacent chunks
        for r in top_results:
            book_id_val = r["bookId"]
            chunk_idx = r["chunkIndex"]
            cursor.execute(
                "SELECT chunk_text FROM book_embeddings WHERE book_id = %s AND user_id = %s AND chunk_index = %s",
                (book_id_val, user_id, chunk_idx - 1),
            )
            prev_row = cursor.fetchone()
            r["contextBefore"] = prev_row["chunk_text"] if prev_row else None
            cursor.execute(
                "SELECT chunk_text FROM book_embeddings WHERE book_id = %s AND user_id = %s AND chunk_index = %s",
                (book_id_val, user_id, chunk_idx + 1),
            )
            next_row = cursor.fetchone()
            r["contextAfter"] = next_row["chunk_text"] if next_row else None

        # Convert to RetrievedChunk models with rank
        retrieved = [
            RetrievedChunk(
                chunk_id=r["chunkId"],
                book_id=r["bookId"],
                book_title=r["bookTitle"],
                chunk_index=r["chunkIndex"],
                text=r["chunkText"],
                page_number=r.get("pageNumber"),
                chapter_title=r.get("chapterTitle"),
                context_before=r.get("contextBefore"),
                context_after=r.get("contextAfter"),
                similarity=r.get("similarity"),
                bm25_score=r.get("bm25_score"),
                rerank_score=r.get("rerank_score"),
                rrf_score=r.get("rrf_score"),
                rank=idx + 1,
            )
            for idx, r in enumerate(top_results)
        ]

        return retrieved, len(rows)

    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass


class EmbeddingDimensionMismatch(Exception):
    """Raised when the query embedding dimension does not match stored embeddings."""

    def __init__(self, query_dim: int, stored_dim: int):
        self.query_dim = query_dim
        self.stored_dim = stored_dim
        super().__init__(
            f"Embedding dimension mismatch: query vector is {query_dim}-d but stored embeddings are {stored_dim}-d."
        )


def _compute_bm25_scores(query: str, documents: list[dict], k1: float = 1.5, b: float = 0.75) -> dict[int, float]:
    """Compute BM25 scores for a query against a list of documents."""
    from collections import Counter
    import re

    query_tokens = [w.lower() for w in re.findall(r'\w+', query) if len(w) > 1]
    if not query_tokens:
        return {}

    doc_tokens_list = []
    doc_lengths = []
    for doc in documents:
        tokens = [w.lower() for w in re.findall(r'\w+', doc["chunkText"]) if len(w) > 1]
        doc_tokens_list.append(tokens)
        doc_lengths.append(len(tokens))

    num_docs = len(documents)
    if num_docs == 0:
        return {}

    avg_doc_len = sum(doc_lengths) / num_docs
    df = Counter()
    for tokens in doc_tokens_list:
        unique_tokens = set(tokens)
        for token in query_tokens:
            if token in unique_tokens:
                df[token] += 1

    scores: dict[int, float] = {}
    for idx, doc in enumerate(documents):
        chunk_id = doc["chunkId"]
        tokens = doc_tokens_list[idx]
        tf = Counter(tokens)
        doc_len = doc_lengths[idx]

        score = 0.0
        for token in query_tokens:
            if token not in tf:
                continue
            idf = __import__("math").log((num_docs - df[token] + 0.5) / (df[token] + 0.5) + 1.0)
            freq = tf[token]
            num = freq * (k1 + 1)
            denom = freq + k1 * (1 - b + b * (doc_len / avg_doc_len))
            score += idf * (num / denom)
        if score > 0:
            scores[chunk_id] = score
    return scores
