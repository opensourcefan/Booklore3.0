"""Unit tests for chunk_filter.py."""

from models import Chunk
from chunk_filter import apply_chunk_filter


def _make_chunk(text: str, chapter_title: str | None = None, chunk_id: int = 1) -> Chunk:
    return Chunk(
        chunk_id=chunk_id,
        book_id=1,
        book_title="Test Book",
        chunk_index=chunk_id,
        text=text,
        page_number=chunk_id,
        chapter_title=chapter_title,
    )


def test_keeps_normal_short_paragraph():
    chunk = _make_chunk("It was a dark and stormy night.")
    result = apply_chunk_filter([chunk])
    assert len(result.kept) == 1
    assert result.dropped == []


def test_drops_heading_only_fragment():
    chunk = _make_chunk("Chapter One: The Beginning", chapter_title="Chapter One: The Beginning")
    result = apply_chunk_filter([chunk])
    assert len(result.kept) == 0
    assert len(result.dropped) == 1


def test_safety_valve_when_all_would_drop():
    chunks = [
        _make_chunk("Chapter One", chapter_title="Chapter One", chunk_id=1),
        _make_chunk("Chapter Two", chapter_title="Chapter Two", chunk_id=2),
    ]
    result = apply_chunk_filter(chunks)
    assert result.reason == "safety_valve"
    assert len(result.kept) == 2


def test_strict_mode_drops_very_short():
    chunk = _make_chunk("Hi.")
    result = apply_chunk_filter([chunk], strict=True)
    assert len(result.kept) == 0
