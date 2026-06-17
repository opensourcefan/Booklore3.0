"""Chunk quality filtering stage.

The goal is to remove heading-only fragments, empty OCR noise, and
index/table-of-contents-style lists without excluding legitimate short
paragraphs (comics, manga, brief prose).
"""

from __future__ import annotations

import logging
import re
from typing import Iterable

from models import Chunk

logger = logging.getLogger("fable-ai-search")


# Markers that strongly indicate an index / table of contents / reference chunk.
_TOC_MARKERS = {
    "index", "table of contents", "glossary", "appendix",
    "list of entries", "list of figures", "list of tables",
    "list of illustrations", "topical list", "references",
    "bibliography", "acknowledgments", "preface",
}

# Spaced-out variants sometimes produced by OCR.
_SPACED_TOC_MARKERS = {"i n d e x", "g l o s s a r y", "t a b l e  o f  c o n t e n t s"}


def _has_toc_marker(text: str, chapter_title: str | None) -> bool:
    """Return True if the chunk text or chapter title looks like a TOC/index fragment."""
    text_lower = text.lower()
    title_lower = (chapter_title or "").lower()
    if any(marker in title_lower for marker in _TOC_MARKERS):
        return True
    if any(marker in text_lower[:200] for marker in _TOC_MARKERS):
        return True
    if any(marker in text_lower for marker in _SPACED_TOC_MARKERS):
        return True
    return False


def _looks_like_title_list(text: str) -> bool:
    """Detect long comma-separated lists of short title-like fragments.

    Index/toc chunks often contain many short phrases separated by commas
    with very few sentence terminators. A high comma-to-sentence ratio combined
    with many title-case tokens is a strong signal of a reference list.
    """
    if not text:
        return False

    sentences = [s.strip() for s in re.split(r"[.!?]", text) if s.strip()]
    if not sentences:
        return False

    commas = text.count(",")
    semicolons = text.count(";")
    punctuation_per_sentence = (commas + semicolons) / len(sentences)
    avg_sentence_len = sum(len(s) for s in sentences) / len(sentences)

    # A reference list typically has many commas and very long "sentences".
    if punctuation_per_sentence >= 4 and avg_sentence_len >= 300:
        return True

    return False


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

    # TOC / index / reference-list guard.
    if _has_toc_marker(text, chunk.chapter_title):
        return False

    # Long comma-separated title lists (e.g. "TOPICAL LIST OF ENTRIES A, B, C...").
    if _looks_like_title_list(text):
        return False

    if strict:
        words = text.split()
        if len(words) < 4:
            return False

    return True
