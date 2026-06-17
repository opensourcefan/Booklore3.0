"""Chunk quality filtering stage.

The goal is to remove heading-only fragments and empty OCR noise without
excluding legitimate short paragraphs (comics, manga, brief prose).
"""

from __future__ import annotations

import logging
from typing import Iterable

from models import Chunk

logger = logging.getLogger("fable-ai-search")


class ChunkFilterResult:
    """Result of applying the chunk quality filter."""

    def __init__(self, kept: list[Chunk], dropped: list[Chunk], reason: str | None = None):
        self.kept = kept
        self.dropped = dropped
        self.reason = reason  # e.g. "safety_valve" if filter was bypassed


def apply_chunk_filter(chunks: Iterable[Chunk], strict: bool = False) -> ChunkFilterResult:
    """Apply quality filtering to a candidate set of chunks.

    Args:
        chunks: Candidate chunks.
        strict: If True, apply a minimum word count in addition to the heading-only guard.

    Returns:
        ChunkFilterResult. If the filter would drop every chunk, the safety valve
        returns all chunks unchanged and logs a warning.
    """
    kept: list[Chunk] = []
    dropped: list[Chunk] = []

    for chunk in chunks:
        if _should_keep(chunk, strict):
            kept.append(chunk)
        else:
            dropped.append(chunk)

    # Safety valve: if the filter would drop every candidate AND there were
    # multiple candidates, bypass the filter rather than returning zero results.
    # For a single candidate we respect the filter so heading-only fragments
    # are still dropped when they are the only result.
    if not kept and chunks:
        candidate_list = list(chunks)
        if len(candidate_list) > 1:
            logger.warning(
                "Chunk quality filter would drop all %d candidates; bypassing filter for this query.",
                len(candidate_list),
            )
            return ChunkFilterResult(kept=candidate_list, dropped=[], reason="safety_valve")

    return ChunkFilterResult(kept=kept, dropped=dropped)


def _should_keep(chunk: Chunk, strict: bool) -> bool:
    text = (chunk.text or "").strip()
    if not text:
        return False

    # Heading-only guard: chunk text is identical to its chapter title.
    if chunk.chapter_title and text.lower() == chunk.chapter_title.strip().lower():
        return False

    if strict:
        words = text.split()
        if len(words) < 4:
            return False

    return True
