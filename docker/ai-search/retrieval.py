"""Retrieval stage.

Performs vector similarity search, optional hybrid BM25 fusion (RRF), optional
cross-encoder reranking, and fetches adjacent chunks for context.

Vector path (#4): load float32 embedding_blob (or JSON fallback), score with
numpy matmul, then fetch chunk_text only for the shortlisted candidates.
Whole-library / scoped search semantics are unchanged; no re-embedding required.

Dependencies (embedding model, DB pool, config globals) are passed in explicitly
so this module can be tested in isolation and so app.py remains the composition root.
"""

from __future__ import annotations

import logging
import math
import re
from typing import Any, Callable

import numpy as np

from models import RetrievedChunk
from vector_codec import (
    apply_matryoshka,
    build_matrix,
    cosine_scores,
    maybe_backfill_blob,
    unpack_embedding,
)

logger = logging.getLogger("fable-ai-search")

# After vector scoring, fetch text for this many top hits before phrase/TOC/keyword
# filters and hybrid/rerank. Keeps whole-corpus vector scan cheap while preserving
# quality filters that need chunk text.
_TEXT_CANDIDATE_POOL = 200


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
        cosine_similarity_fn: Function that computes cosine similarity (legacy; used as fallback).
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
    query_vector_list = compute_embedding_fn(embedding_text)
    query_vector = np.asarray(query_vector_list, dtype=np.float32)
    query_dim = int(query_vector.shape[0])

    conn = None
    cursor = None
    try:
        conn = get_db_connection_fn()
        cursor = conn.cursor(dictionary=True)

        rows = _load_embedding_rows(cursor, user_id, book_ids)
        total_searched = len(rows)
        if not rows:
            return [], 0

        meta_rows: list[dict] = []
        vectors: list[np.ndarray] = []
        backfill_ids: list[tuple[int, np.ndarray]] = []

        _toc_title_markers = {
            "index", "table of contents", "glossary", "appendix",
            "list of entries", "list of figures", "list of tables",
            "list of illustrations", "topical list", "references",
            "bibliography", "acknowledgments", "preface",
        }

        for row in rows:
            if not is_index_request:
                ch_title = (row.get("chapter_title") or "").lower()
                if any(marker in ch_title for marker in _toc_title_markers):
                    continue

            vector = unpack_embedding(row.get("embedding_blob"), row.get("embedding_vector"))
            if vector is None or vector.size == 0:
                continue

            if vector.shape[0] != query_dim and matryoshka_dimensions <= 0:
                # Allow matryoshka truncate below; otherwise hard fail once.
                if not meta_rows:
                    raise EmbeddingDimensionMismatch(query_dim, int(vector.shape[0]))
                continue

            if row.get("embedding_blob") is None and row.get("embedding_vector"):
                backfill_ids.append((row["id"], vector))

            vector = apply_matryoshka(vector, matryoshka_dimensions)
            if vector.shape[0] != query_dim and matryoshka_dimensions > 0:
                # Query side should already match matryoshka dim from embed path;
                # if not, align by truncating query later via apply on query too.
                pass

            meta_rows.append(row)
            vectors.append(vector)

        if backfill_ids:
            for row_id, vec in backfill_ids[:500]:
                maybe_backfill_blob(cursor, row_id, vec)
            try:
                conn.commit()
            except Exception:
                pass

        if not vectors:
            return [], total_searched

        # Align query to matrix width (matryoshka / mixed rows)
        matrix = build_matrix(vectors, int(vectors[0].shape[0]))
        q = apply_matryoshka(query_vector, matryoshka_dimensions)
        if q.shape[0] != matrix.shape[1]:
            raise EmbeddingDimensionMismatch(int(q.shape[0]), int(matrix.shape[1]))

        scores = cosine_scores(q, matrix)

        # Soft rank by pure vector score; text-dependent boosts applied after fetch.
        order = np.argsort(-scores)
        pool_size = min(len(order), max(_TEXT_CANDIDATE_POOL, top_k * 20))
        shortlist_idx = order[:pool_size]

        shortlist_ids = [int(meta_rows[i]["id"]) for i in shortlist_idx]
        text_by_id = _fetch_chunk_texts(cursor, shortlist_ids)

        documents: list[dict] = []
        scored_vector: list[dict] = []

        for i in shortlist_idx:
            row = meta_rows[i]
            chunk_id = int(row["id"])
            chunk_text = text_by_id.get(chunk_id, "") or ""
            similarity = float(scores[i])

            if not is_index_request and _looks_like_toc_text(chunk_text):
                continue

            if required_phrases:
                text_lower = chunk_text.lower()
                title_lower = (row.get("chapter_title") or "").lower()
                book_lower = (row.get("book_title") or "").lower()
                if not all(
                    kw.lower() in text_lower or kw.lower() in title_lower or kw.lower() in book_lower
                    for kw in required_phrases
                ):
                    continue

            if semantic_keywords:
                text_lower = chunk_text.lower()
                title_lower = (row.get("chapter_title") or "").lower()
                book_lower = (row.get("book_title") or "").lower()
                match_count = 0
                for kw in semantic_keywords:
                    if kw in text_lower or kw in title_lower or kw in book_lower:
                        match_count += 1
                    elif kw.endswith("s") and len(kw) > 3 and kw[:-1] in text_lower:
                        match_count += 1
                similarity += min(0.10, match_count * 0.02)

            doc = {
                "chunkId": chunk_id,
                "bookId": row["book_id"],
                "bookTitle": row["book_title"],
                "chunkIndex": row["chunk_index"],
                "chunkText": chunk_text,
                "pageNumber": row["page_number"],
                "chapterTitle": row["chapter_title"],
            }
            documents.append(doc)

            if similarity >= similarity_threshold:
                doc_copy = doc.copy()
                doc_copy["similarity"] = round(similarity, 4)
                scored_vector.append(doc_copy)

        logger.info(
            "Vectorized retrieval: scored %d chunks, shortlisted %d, %d above threshold %s for query: %s",
            len(vectors),
            len(shortlist_idx),
            len(scored_vector),
            similarity_threshold,
            embedding_text[:80],
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
                doc_copy["similarity"] = (
                    scored_vector[vector_ranks[chunk_id]]["similarity"]
                    if chunk_id in vector_ranks
                    else round(rrf_score, 4)
                )
                candidates.append(doc_copy)

            candidates.sort(key=lambda x: x["rrf_score"], reverse=True)
        else:
            candidates = scored_vector

        if reranking_enabled and reranker_model is not None:
            rerank_pool_size = min(20, max(top_k, top_k * 2))
            candidates_to_rerank = candidates[:rerank_pool_size]
            if candidates_to_rerank:
                try:
                    pairs = [[embedding_text, c["chunkText"]] for c in candidates_to_rerank]
                    scores_rr = reranker_model.predict(pairs)
                    if hasattr(scores_rr, "tolist"):
                        scores_rr = scores_rr.tolist()
                    if isinstance(scores_rr, float):
                        scores_rr = [scores_rr]
                    for idx, score in enumerate(scores_rr):
                        candidates_to_rerank[idx]["rerank_score"] = round(float(score), 4)
                    candidates_to_rerank.sort(key=lambda x: x["rerank_score"], reverse=True)
                    candidates = candidates_to_rerank + candidates[rerank_pool_size:]
                except Exception as e:
                    logger.error("Failed to run reranker: %s", e)

        top_results = candidates[:top_k]

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

        return retrieved, total_searched

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


def _load_embedding_rows(cursor: Any, user_id: int, book_ids: list[int] | None) -> list[dict]:
    """Load embedding metadata + vectors without chunk_text."""
    base_cols = """be.id, be.book_id, be.user_id, be.chunk_index,
                   be.embedding_vector, be.page_number, be.chapter_title,
                   b.title as book_title"""
    with_blob = base_cols.replace(
        "be.embedding_vector",
        "be.embedding_vector, be.embedding_blob",
    )

    def _run(cols: str) -> list[dict]:
        if book_ids and len(book_ids) > 0:
            placeholders = ",".join(["%s"] * len(book_ids))
            cursor.execute(
                f"""SELECT {cols}
                    FROM book_embeddings be
                    JOIN book_metadata b ON b.book_id = be.book_id
                    WHERE be.user_id = %s AND be.book_id IN ({placeholders})""",
                [user_id] + list(book_ids),
            )
        else:
            cursor.execute(
                f"""SELECT {cols}
                    FROM book_embeddings be
                    JOIN book_metadata b ON b.book_id = be.book_id
                    WHERE be.user_id = %s""",
                (user_id,),
            )
        return cursor.fetchall() or []

    try:
        return _run(with_blob)
    except Exception as exc:
        # Rolling upgrade: column not migrated yet.
        logger.info("embedding_blob unavailable (%s); falling back to JSON vectors", exc)
        return _run(base_cols)


def _fetch_chunk_texts(cursor: Any, chunk_ids: list[int]) -> dict[int, str]:
    if not chunk_ids:
        return {}
    placeholders = ",".join(["%s"] * len(chunk_ids))
    cursor.execute(
        f"SELECT id, chunk_text FROM book_embeddings WHERE id IN ({placeholders})",
        chunk_ids,
    )
    return {int(r["id"]): r["chunk_text"] or "" for r in (cursor.fetchall() or [])}


def _looks_like_toc_text(text: str) -> bool:
    if not text:
        return False
    text_prefix = text[:200].lower()
    if "i n d e x" in text_prefix or "g l o s s a r y" in text_prefix:
        return True
    words = text_prefix.split()
    numbers = [w for w in words if re.match(r"^\d+$", w)]
    if len(words) > 0 and (len(numbers) / len(words)) > 0.15:
        return True
    return False


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

    query_tokens = [w.lower() for w in re.findall(r"\w+", query) if len(w) > 1]
    if not query_tokens:
        return {}

    doc_tokens_list = []
    doc_lengths = []
    for doc in documents:
        tokens = [w.lower() for w in re.findall(r"\w+", doc["chunkText"]) if len(w) > 1]
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
            idf = math.log((num_docs - df[token] + 0.5) / (df[token] + 0.5) + 1.0)
            freq = tf[token]
            num = freq * (k1 + 1)
            denom = freq + k1 * (1 - b + b * (doc_len / avg_doc_len))
            score += idf * (num / denom)
        if score > 0:
            scores[chunk_id] = score
    return scores
