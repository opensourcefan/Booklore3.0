"""Unit tests for synthesis.py."""

from models import ParsedQuery, RetrievedChunk
from synthesis import parse_synthesis_response, build_context, _best_matching_chunk_id


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


def test_recover_missing_citations_by_text_overlap():
    chunks = [
        _chunk(42, "Galactic Warriors by Joe Orlando is a classic space opera comic."),
        _chunk(43, "The Starblade covers trade routes across the galaxy."),
    ]
    raw = """- Galactic Warriors by Joe Orlando.
- The Starblade covers trade routes."""
    result = parse_synthesis_response(raw, chunks)
    assert len(result.items) == 2
    assert result.items[0].chunk_ids == [42]
    assert result.items[1].chunk_ids == [43]


def test_drop_items_with_no_citation_and_no_overlap():
    chunks = [_chunk(42, "Galactic Warriors by Joe Orlando.")]
    raw = "- Totally unrelated invented fact."
    result = parse_synthesis_response(raw, chunks)
    assert result.items == []


def test_parse_no_relevant_info_text():
    raw = "I could not find any relevant information for this search."
    result = parse_synthesis_response(raw)
    assert result.no_relevant_info is True
    assert result.items == []


def test_distinct_same_chunk_items_are_preserved():
    """Five distinct comics listed on one page must NOT be merged.

    The old chunk-ID-only dedup merged these into one item, destroying a
    legitimate 5-item list. The new text-overlap dedup preserves them because
    the item texts are distinct (low word overlap).
    """
    chunks = [_chunk(142, "Batman time travel. Doom Patrol street. Animal Man cartoon. Zatanna magic. Batman RIP.")]
    raw = """1. Batman time travel. [ChunkID: 142]
2. Doom Patrol street. [ChunkID: 142]
3. Animal Man cartoon. [ChunkID: 142]
4. Zatanna magic. [ChunkID: 142]
5. Batman RIP. [ChunkID: 142]"""
    result = parse_synthesis_response(raw, chunks)
    assert len(result.items) == 5
    for item in result.items:
        assert item.chunk_ids == [142]


def test_near_duplicate_same_chunk_items_are_merged():
    """Near-duplicate reworded items citing the same chunk must still merge.

    This is the real hallucination pattern: the LLM repeats the same fact with
    minor wording changes to satisfy a count request. All three items share
    almost every word, so they collapse into one.
    """
    chunks = [_chunk(142, "Batman: The Return Of Bruce Wayne is a time travel comic.")]
    raw = """1. Batman: The Return Of Bruce Wayne is a time travel comic. [ChunkID: 142]
2. Batman: The Return Of Bruce Wayne is a comic about time travel. [ChunkID: 142]
3. Batman: The Return Of Bruce Wayne is a time travel comic story. [ChunkID: 142]"""
    result = parse_synthesis_response(raw, chunks)
    assert len(result.items) == 1
    assert result.items[0].chunk_ids == [142]
    assert "Batman" in result.items[0].text


def test_do_not_merge_items_with_different_chunks():
    chunks = [_chunk(1, "First fact. Third fact."), _chunk(2, "Second fact.")]
    raw = """1. First fact. [ChunkID: 1]
2. Second fact. [ChunkID: 2]
3. Third fact. [ChunkID: 1]"""
    result = parse_synthesis_response(raw, chunks)
    assert len(result.items) == 3
    assert result.items[0].chunk_ids == [1]
    assert result.items[1].chunk_ids == [2]
    assert result.items[2].chunk_ids == [1]


def test_best_matching_chunk_id_finds_overlap():
    chunks = [
        _chunk(1, "Batman: The Return Of Bruce Wayne features time travel."),
        _chunk(2, "Doom Patrol Issue 36 introduces Danny the sentient street."),
    ]
    assert _best_matching_chunk_id("Batman: The Return Of Bruce Wayne", chunks) == 1
    assert _best_matching_chunk_id("Doom Patrol Issue 36", chunks) == 2
    assert _best_matching_chunk_id("completely unrelated phrase", chunks) is None


def test_build_context_includes_chunk_ids():
    parsed = ParsedQuery(raw="list comics")
    chunks = [_chunk(42, "Galactic Warriors...", 168)]
    context = build_context(parsed, chunks)
    assert "[ChunkID: 42]" in context
    assert "Galactic Warriors..." in context
    assert "Page 168" in context


def test_parse_concatenated_numbered_items():
    """Lazy LLMs emit "1 Foo. 2Bar. 3Baz." as one line; we must split it."""
    raw = "1 Batman time travel. 2Doom Patrol street. 3Animal Man cartoon."
    chunks = [
        _chunk(1, "Batman time travel."),
        _chunk(2, "Doom Patrol street."),
        _chunk(3, "Animal Man cartoon."),
    ]
    result = parse_synthesis_response(raw, chunks)
    assert len(result.items) == 3
    assert result.items[0].chunk_ids == [1]
    assert result.items[1].chunk_ids == [2]
    assert result.items[2].chunk_ids == [3]


def test_best_matching_chunk_id_uses_item_word_count():
    """Normalization by item word count lets short items match short chunks."""
    chunks = [_chunk(1, "Batman time travel.")]
    assert _best_matching_chunk_id("Batman time travel", chunks) == 1
    assert _best_matching_chunk_id("completely unrelated phrase", chunks) is None
