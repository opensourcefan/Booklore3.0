"""Unit tests for compression.py."""

from models import RetrievedChunk
from compression import compress_chunks, _split_sentences, _extract_keywords


def _chunk(chunk_id: int, text: str, page: int = 1) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        book_id=1,
        book_title="Test Book",
        chunk_index=chunk_id,
        text=text,
        page_number=page,
        rank=chunk_id,
    )


def test_split_sentences():
    text = "First sentence. Second sentence. Third sentence."
    sentences = _split_sentences(text)
    assert len(sentences) == 3
    assert sentences[0] == "First sentence."
    assert sentences[1] == "Second sentence."
    assert sentences[2] == "Third sentence."


def test_split_sentences_handles_abbreviations():
    text = "Mr. Smith went to the store. He bought milk."
    sentences = _split_sentences(text)
    assert len(sentences) == 2


def test_extract_keywords():
    text = "list 5 science fiction comics about space exploration"
    keywords = _extract_keywords(text)
    assert "science" in keywords
    assert "fiction" in keywords
    assert "comics" in keywords
    assert "space" in keywords
    assert "exploration" in keywords
    # Stopwords should be removed
    assert "list" not in keywords
    assert "about" not in keywords
    assert "the" not in keywords


def test_compress_chunks_keeps_relevant_sentences():
    chunks = [
        _chunk(1, "Galactic Warriors is a science fiction comic. It was published in 1985. The author is Joe Orlando. The story follows space explorers. It won several awards."),
    ]
    result = compress_chunks(chunks, query_text="science fiction comic", compression_ratio=0.5, min_sentences=1)
    assert len(result) == 1
    # The compressed text should contain the relevant sentence
    assert "Galactic Warriors" in result[0].text
    # Should be shorter than original
    assert len(result[0].text) < len(chunks[0].text)


def test_compress_chunks_keeps_min_sentences_when_no_match():
    chunks = [
        _chunk(1, "First sentence about topic A. Second sentence about topic B. Third sentence about topic C. Fourth sentence about topic D."),
    ]
    result = compress_chunks(chunks, query_text="completely unrelated topic", compression_ratio=0.5, min_sentences=2)
    assert len(result) == 1
    # Should keep at least min_sentences even with no keyword match
    sentences = _split_sentences(result[0].text)
    assert len(sentences) >= 2


def test_compress_chunks_noop_for_short_chunks():
    chunks = [
        _chunk(1, "Short text."),
    ]
    result = compress_chunks(chunks, query_text="anything", compression_ratio=0.5, min_sentences=2)
    assert len(result) == 1
    # Short chunks (<= min_sentences) are returned unchanged
    assert result[0].text == chunks[0].text


def test_compress_chunks_empty_query():
    chunks = [_chunk(1, "Some text. More text.")]
    result = compress_chunks(chunks, query_text="", compression_ratio=0.5)
    assert result == chunks


def test_compress_chunks_empty_list():
    result = compress_chunks([], query_text="anything")
    assert result == []


def test_compress_chunks_preserves_metadata():
    chunks = [
        RetrievedChunk(
            chunk_id=42,
            book_id=1,
            book_title="Test Book",
            chunk_index=0,
            text="Relevant sentence about science fiction. Another sentence about something else. Yet another sentence.",
            page_number=168,
            chapter_title="Chapter 1",
            similarity=0.85,
            bm25_score=1.2,
            rank=1,
        ),
    ]
    result = compress_chunks(chunks, query_text="science fiction", compression_ratio=0.5, min_sentences=1)
    assert len(result) == 1
    assert result[0].chunk_id == 42
    assert result[0].book_id == 1
    assert result[0].book_title == "Test Book"
    assert result[0].page_number == 168
    assert result[0].chapter_title == "Chapter 1"
    assert result[0].similarity == 0.85
    assert result[0].bm25_score == 1.2
    assert result[0].rank == 1
