"""Binary embedding helpers for fast vectorized retrieval.

Embeddings remain stored as JSON in embedding_vector for compatibility.
embedding_blob holds the same floats as little-endian float32 bytes so search
can avoid json.loads per chunk. Existing rows are backfilled lazily from JSON
— no re-embedding required.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import numpy as np

logger = logging.getLogger("fable-ai-search")


def pack_embedding(vector: list[float] | np.ndarray) -> bytes:
    """Pack a float vector as contiguous float32 bytes."""
    arr = np.asarray(vector, dtype=np.float32)
    return arr.tobytes(order="C")


def unpack_embedding(
    blob: bytes | bytearray | memoryview | None,
    json_fallback: str | None = None,
) -> np.ndarray | None:
    """Load a vector from blob bytes, falling back to JSON text."""
    if blob is not None and len(blob) > 0:
        try:
            return np.frombuffer(blob, dtype=np.float32).copy()
        except (TypeError, ValueError) as exc:
            logger.warning("Failed to unpack embedding_blob: %s", exc)

    if json_fallback:
        try:
            return np.asarray(json.loads(json_fallback), dtype=np.float32)
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            logger.warning("Failed to parse embedding_vector JSON: %s", exc)

    return None


def apply_matryoshka(vector: np.ndarray, dimensions: int) -> np.ndarray:
    """Truncate and L2-renormalize when Matryoshka dimensions are enabled."""
    if dimensions <= 0 or len(vector) <= dimensions:
        return vector
    truncated = vector[:dimensions].astype(np.float32, copy=False)
    norm = float(np.linalg.norm(truncated))
    if norm > 0:
        truncated = truncated / norm
    return truncated


def build_matrix(
    vectors: list[np.ndarray],
    query_dim: int,
) -> np.ndarray:
    """Stack equal-length vectors into an (n, dim) float32 matrix."""
    if not vectors:
        return np.zeros((0, query_dim), dtype=np.float32)
    return np.stack(vectors, axis=0).astype(np.float32, copy=False)


def cosine_scores(query: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """Cosine similarity for L2-normalized (or near-normalized) rows.

    Uses a plain matmul. Stored embeddings from SentenceTransformer are
    normalize_embeddings=True; external providers may not be — we normalize
    both sides defensively.
    """
    if matrix.size == 0:
        return np.zeros(0, dtype=np.float32)

    q = query.astype(np.float32, copy=False)
    q_norm = float(np.linalg.norm(q))
    if q_norm > 0:
        q = q / q_norm

    row_norms = np.linalg.norm(matrix, axis=1)
    # Avoid divide-by-zero for empty/corrupt rows
    safe = np.where(row_norms > 0, row_norms, 1.0)
    normalized = matrix / safe[:, np.newaxis]
    normalized[row_norms <= 0] = 0.0
    return normalized @ q


def maybe_backfill_blob(cursor: Any, row_id: int, vector: np.ndarray) -> None:
    """Best-effort write of embedding_blob for a row that still only has JSON."""
    try:
        cursor.execute(
            "UPDATE book_embeddings SET embedding_blob = %s WHERE id = %s AND embedding_blob IS NULL",
            (pack_embedding(vector), row_id),
        )
    except Exception as exc:
        # Column may not exist yet during rolling upgrades; ignore.
        logger.debug("embedding_blob backfill skipped for id=%s: %s", row_id, exc)
