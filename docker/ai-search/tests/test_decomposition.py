"""Unit tests for decomposition.py."""

from models import ParsedQuery, RetrievedChunk
from decomposition import decompose_query, decomposed_retrieve, should_use_decomposition


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


def test_should_use_decomposition_disabled():
    """Decomposition is disabled when the flag is False."""
    assert should_use_decomposition("openai", False) is False


def test_should_use_decomposition_local_provider():
    """Decomposition is auto-disabled for local providers."""
    assert should_use_decomposition("local", True) is False


def test_should_use_decomposition_external_provider():
    """Decomposition is enabled for external providers when flag is True."""
    assert should_use_decomposition("openai", True) is True
    assert should_use_decomposition("ollama", True) is True


def test_decompose_query_success():
    """Decomposes a complex query into sub-queries."""
    parsed = ParsedQuery(
        raw="comics about time travel and parallel universes",
        semantic_keywords=["comics", "time", "travel", "parallel", "universes"],
    )

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return "comics about time travel\ncomics about parallel universes"

    sub_queries = decompose_query(parsed, generate_fn)
    assert len(sub_queries) >= 2
    assert "time travel" in " ".join(sub_queries).lower() or "parallel" in " ".join(sub_queries).lower()


def test_decompose_query_empty_response():
    """Returns only original query when LLM returns empty."""
    parsed = ParsedQuery(raw="test", semantic_keywords=["test"])

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return ""

    sub_queries = decompose_query(parsed, generate_fn)
    assert sub_queries == [parsed.embedding_text]


def test_decompose_query_exception():
    """Returns only original query when LLM raises exception."""
    parsed = ParsedQuery(raw="test", semantic_keywords=["test"])

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        raise RuntimeError("LLM unavailable")

    sub_queries = decompose_query(parsed, generate_fn)
    assert sub_queries == [parsed.embedding_text]


def test_decompose_query_strips_numbering():
    """Strips numbering prefixes from sub-query lines."""
    parsed = ParsedQuery(raw="complex query about many things", semantic_keywords=["complex", "query"])

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return "1. first sub question\n2. second sub question"

    sub_queries = decompose_query(parsed, generate_fn)
    assert len(sub_queries) >= 2
    for sq in sub_queries:
        assert not sq[0].isdigit()


def test_decomposed_retrieve_fallback_single():
    """Falls back to standard retrieval when only one sub-query."""
    parsed = ParsedQuery(raw="test", semantic_keywords=["test"])

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return ""  # No sub-queries

    def retrieve_fn(embedding_text, book_ids, user_id, top_k):
        return [_chunk(1, "test result")], 10

    chunks, total = decomposed_retrieve(
        query=parsed,
        retrieve_fn=retrieve_fn,
        generate_fn=generate_fn,
        book_ids=None,
        user_id=1,
        top_k=5,
    )
    assert len(chunks) == 1
    assert chunks[0].chunk_id == 1
    assert total == 10


def test_decomposed_retrieve_rrf_fusion():
    """Multiple sub-queries produce RRF-fused results."""
    parsed = ParsedQuery(
        raw="comics about time travel and parallel universes",
        semantic_keywords=["comics", "time", "travel"],
    )

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return "comics about time travel\ncomics about parallel universes"

    call_count = [0]

    def retrieve_fn(embedding_text, book_ids, user_id, top_k):
        call_count[0] += 1
        if "time travel" in embedding_text.lower():
            return [_chunk(1, "Time travel comic"), _chunk(2, "Another time comic")], 100
        else:
            return [_chunk(3, "Parallel universe comic"), _chunk(2, "Another time comic")], 100

    chunks, total = decomposed_retrieve(
        query=parsed,
        retrieve_fn=retrieve_fn,
        generate_fn=generate_fn,
        book_ids=None,
        user_id=1,
        top_k=5,
    )
    assert len(chunks) >= 1
    assert total == 100
    for chunk in chunks:
        assert chunk.rrf_score is not None
        assert chunk.rrf_score > 0
