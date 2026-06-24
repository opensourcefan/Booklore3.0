"""Contextual Compression stage.

After retrieval, this stage compresses long chunks by extracting only the
sentences that are relevant to the query. This reduces noise in the context
passed to the LLM, improving answer quality and reducing token usage.

This is a lightweight, non-LLM stage that uses sentence splitting and keyword
overlap to filter sentences. It does not add extra LLM calls.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from models import RetrievedChunk

logger = logging.getLogger("fable-ai-search")


def compress_chunks(
    chunks: list[RetrievedChunk],
    query_text: str,
    compression_ratio: float = 0.5,
    min_sentences: int = 2,
) -> list[RetrievedChunk]:
    """Compress retrieved chunks by keeping only query-relevant sentences.

    Each chunk is split into sentences. Sentences that have keyword overlap
    with the query are kept. If no sentences match, the first few sentences
    are kept as a fallback.

    Args:
        chunks: Retrieved chunks to compress.
        query_text: The query text for relevance matching.
        compression_ratio: Target fraction of sentences to keep (0.0-1.0).
        min_sentences: Minimum number of sentences to keep per chunk.

    Returns:
        List of compressed chunks (same objects with text replaced).
    """
    if not chunks or not query_text:
        return chunks

    query_keywords = _extract_keywords(query_text)
    if not query_keywords:
        return chunks

    compressed = []
    for chunk in chunks:
        sentences = _split_sentences(chunk.text)
        if len(sentences) <= min_sentences:
            compressed.append(chunk)
            continue

        # Score each sentence by keyword overlap
        scored = []
        for sentence in sentences:
            sentence_lower = sentence.lower()
            score = sum(1 for kw in query_keywords if kw in sentence_lower)
            scored.append((sentence, score))

        # Sort by score descending
        scored.sort(key=lambda x: x[1], reverse=True)

        # Keep top sentences based on compression ratio
        keep_count = max(min_sentences, int(len(sentences) * compression_ratio))
        keep_count = min(keep_count, len(sentences))

        # Keep the top-scoring sentences, but preserve original order
        kept_indices = set()
        for i, (_, score) in enumerate(scored):
            if len(kept_indices) >= keep_count:
                break
            if score > 0:
                kept_indices.add(i)

        # If no sentences matched, keep the first min_sentences
        if not kept_indices:
            kept_indices = set(range(min(min_sentences, len(sentences))))

        # Reconstruct in original order
        compressed_text = " ".join(
            sentences[i] for i in sorted(kept_indices)
        )

        if compressed_text and len(compressed_text) < len(chunk.text):
            logger.debug(
                "Compressed chunk %d: %d -> %d chars (kept %d/%d sentences)",
                chunk.chunk_id, len(chunk.text), len(compressed_text),
                len(kept_indices), len(sentences),
            )
            # Create a new chunk with compressed text
            compressed.append(RetrievedChunk(
                chunk_id=chunk.chunk_id,
                book_id=chunk.book_id,
                book_title=chunk.book_title,
                chunk_index=chunk.chunk_index,
                text=compressed_text,
                page_number=chunk.page_number,
                chapter_title=chunk.chapter_title,
                context_before=chunk.context_before,
                context_after=chunk.context_after,
                similarity=chunk.similarity,
                bm25_score=chunk.bm25_score,
                rerank_score=chunk.rerank_score,
                rrf_score=chunk.rrf_score,
                rank=chunk.rank,
            ))
        else:
            compressed.append(chunk)

    return compressed


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences using regex."""
    # Split on sentence-ending punctuation followed by space and capital letter
    # or end of string. Handles abbreviations like "Mr." and "Dr." by requiring
    # the next word to start with a capital letter.
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    # Filter out empty strings and very short fragments
    return [s.strip() for s in sentences if len(s.strip()) > 5]


def _extract_keywords(text: str) -> list[str]:
    """Extract meaningful keywords from text."""
    # Remove punctuation and split
    words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
    # Remove common stopwords
    stopwords = {
        "the", "and", "for", "that", "this", "with", "from", "have", "are",
        "was", "not", "but", "you", "all", "can", "has", "had", "her", "his",
        "its", "our", "out", "some", "than", "then", "them", "these", "they",
        "what", "when", "will", "your", "about", "also", "been", "into", "like",
        "more", "only", "other", "over", "such", "than", "very", "which",
        "list", "show", "find", "search", "give", "tell", "want", "need",
    }
    return [w for w in words if w not in stopwords]
