"""Unit tests for disclaimer.py."""

from models import ParsedQuery, RetrievedChunk, ValidatedAnswerItem, AnswerItem
from citation import validate_answer_items
from disclaimer import build_disclaimer


def _chunk(chunk_id: int, text: str) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        book_id=1,
        book_title="Book",
        chunk_index=chunk_id,
        text=text,
        page_number=chunk_id,
        rank=chunk_id,
    )


def test_no_disclaimer_when_count_matches_request():
    parsed = ParsedQuery(raw="list 3 sci-fi comics", requested_count=3, semantic_keywords=["sci-fi", "comics"])
    items = validate_answer_items(
        [
            AnswerItem(text="A sci-fi comic", chunk_ids=[1]),
            AnswerItem(text="B sci-fi comic", chunk_ids=[2]),
            AnswerItem(text="C sci-fi comic", chunk_ids=[3]),
        ],
        [_chunk(1, "A sci-fi comic"), _chunk(2, "B sci-fi comic"), _chunk(3, "C sci-fi comic")],
    )
    disclaimer = build_disclaimer(parsed, items, [])
    assert disclaimer is None


def test_disclaimer_when_count_low():
    parsed = ParsedQuery(raw="list 5 sci-fi comics", requested_count=5, semantic_keywords=["sci-fi", "comics"])
    items = validate_answer_items(
        [AnswerItem(text="A", chunk_ids=[1])],
        [_chunk(1, "A sci-fi comic")],
    )
    disclaimer = build_disclaimer(parsed, items, [])
    assert disclaimer is not None
    assert "only found 1 match" in disclaimer
    assert "not the 5 requested" in disclaimer


def test_no_missing_keyword_when_present():
    parsed = ParsedQuery(raw='list 5 "sci-fi" comics', required_phrases=["sci-fi"], semantic_keywords=["comics"])
    chunks = [_chunk(1, "This is a sci-fi comic.")]
    items = validate_answer_items([AnswerItem(text="A sci-fi comic", chunk_ids=[1])], chunks)
    disclaimer = build_disclaimer(parsed, items, chunks)
    assert disclaimer is None or '"sci-fi"' not in disclaimer


def test_missing_keyword_reported():
    parsed = ParsedQuery(raw='list 5 "time travel" comics', required_phrases=["time travel"])
    chunks = [_chunk(1, "A space comic.")]
    items = validate_answer_items([AnswerItem(text="A space comic", chunk_ids=[1])], chunks)
    disclaimer = build_disclaimer(parsed, items, chunks)
    assert disclaimer is not None
    assert '"time travel"' in disclaimer
