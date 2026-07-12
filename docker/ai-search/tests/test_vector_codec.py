"""Unit tests for vectorized embedding codec and scoring."""

import numpy as np

from vector_codec import (
    apply_matryoshka,
    build_matrix,
    cosine_scores,
    pack_embedding,
    unpack_embedding,
)


def test_pack_unpack_roundtrip():
    original = [0.1, -0.2, 0.3, 0.4]
    blob = pack_embedding(original)
    restored = unpack_embedding(blob)
    assert restored is not None
    np.testing.assert_allclose(restored, np.asarray(original, dtype=np.float32), rtol=1e-6)


def test_unpack_falls_back_to_json():
    restored = unpack_embedding(None, "[1.0, 2.0, 3.0]")
    assert restored is not None
    np.testing.assert_allclose(restored, np.array([1.0, 2.0, 3.0], dtype=np.float32))


def test_cosine_scores_prefers_matching_vector():
    query = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    matrix = build_matrix(
        [
            np.array([1.0, 0.0, 0.0], dtype=np.float32),
            np.array([0.0, 1.0, 0.0], dtype=np.float32),
            np.array([0.7, 0.7, 0.0], dtype=np.float32),
        ],
        3,
    )
    scores = cosine_scores(query, matrix)
    assert scores[0] > scores[2] > scores[1]


def test_matryoshka_truncates_and_renormalizes():
    vector = np.array([3.0, 4.0, 0.0, 0.0], dtype=np.float32)
    truncated = apply_matryoshka(vector, 2)
    assert truncated.shape == (2,)
    np.testing.assert_allclose(np.linalg.norm(truncated), 1.0, rtol=1e-5)
