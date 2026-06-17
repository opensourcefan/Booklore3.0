"""Unit tests for citation.py."""

from models import RetrievedChunk, AnswerItem
from citation import validate_answer_items, render_answer_markdown, source_marker


def _chunk(chunk_id: int, page: int, text: str) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        book_id=1,
        book_title="100 All-Time Greatest Comics",
        chunk_index=chunk_id,
        text=text,
        page_number=page,
        rank=chunk_id,
    )


def test_validates_chunk_ids_and_picks_primary():
    chunks = [_chunk(42, 168, "Galactic Warriors..."), _chunk(43, 169, "Starblade...")]
    items = [
        AnswerItem(text="Galactic Warriors by Joe Orlando", chunk_ids=[42, 999]),
        AnswerItem(text="The Starblade saga", chunk_ids=[43]),
    ]
    validated = validate_answer_items(items, chunks)
    assert len(validated) == 2
    assert validated[0].primary_chunk.chunk_id == 42
    assert validated[0].primary_chunk.page_number == 168
    assert validated[1].primary_chunk.chunk_id == 43


def test_drops_item_with_no_valid_chunk_ids():
    chunks = [_chunk(42, 168, "Galactic Warriors...")]
    items = [AnswerItem(text="Hallucinated item", chunk_ids=[999])]
    validated = validate_answer_items(items, chunks)
    assert len(validated) == 0


def test_source_marker_format():
    chunk = _chunk(42, 168, "...")
    assert source_marker(chunk) == "[Source: 100 All-Time Greatest Comics, Page 168]"


def test_render_markdown():
    chunks = [_chunk(42, 168, "...")]
    items = validate_answer_items([AnswerItem(text="Galactic Warriors", chunk_ids=[42])], chunks)
    md = render_answer_markdown(items)
    assert "Galactic Warriors" in md
    assert "[Source: 100 All-Time Greatest Comics, Page 168]" in md
