"""Unit tests for synthesis.py."""

from models import ParsedQuery, RetrievedChunk
from synthesis import parse_synthesis_response, build_context


def _chunk(chunk_id: int, text: str, page: int = 1) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        book_id=1,
        book_title="Book",
        chunk_index=chunk_id,
        text=text,
        page_number=page,
        rank=chunk_id,
    )


def test_parse_valid_json():
    raw = '{"items": [{"text": "Galactic Warriors", "chunk_ids": [42], "confidence": "high"}], "no_relevant_info": false}'
    result = parse_synthesis_response(raw)
    assert len(result.items) == 1
    assert result.items[0].text == "Galactic Warriors"
    assert result.items[0].chunk_ids == [42]


def test_parse_json_with_markdown_fences():
    raw = '```json\n{"items": [{"text": "A", "chunk_ids": [1]}], "no_relevant_info": false}\n```'
    result = parse_synthesis_response(raw)
    assert len(result.items) == 1


def test_parse_no_relevant_info():
    raw = '{"items": [], "no_relevant_info": true}'
    result = parse_synthesis_response(raw)
    assert result.no_relevant_info is True
    assert result.items == []


def test_parse_invalid_json_falls_back():
    raw = "This is not JSON"
    result = parse_synthesis_response(raw)
    assert result.no_relevant_info is True


def test_parse_markdown_bullets_with_chunk_ids():
    raw = """- Galactic Warriors by Joe Orlando. [ChunkID: 42]
- The Starblade covers trade routes. [ChunkID: 43]"""
    result = parse_synthesis_response(raw)
    assert len(result.items) == 2
    assert result.items[0].text == "Galactic Warriors by Joe Orlando."
    assert result.items[0].chunk_ids == [42]
    assert result.items[1].text == "The Starblade covers trade routes."
    assert result.items[1].chunk_ids == [43]


def test_parse_numbered_markdown_items():
    raw = """1. First item. [ChunkID: 1]
2. Second item. [ChunkID: 2, 3]"""
    result = parse_synthesis_response(raw)
    assert len(result.items) == 2
    assert result.items[0].chunk_ids == [1]
    assert result.items[1].chunk_ids == [2, 3]


def test_parse_no_relevant_info_text():
    raw = "I could not find any relevant information for this search."
    result = parse_synthesis_response(raw)
    assert result.no_relevant_info is True
    assert result.items == []


def test_build_context_includes_chunk_ids():
    parsed = ParsedQuery(raw="list comics")
    chunks = [_chunk(42, "Galactic Warriors...", 168)]
    context = build_context(parsed, chunks)
    assert "[ChunkID: 42]" in context
    assert "Galactic Warriors..." in context
    assert "Page 168" in context
