"""Unit tests for multi_query.py."""

from models import ParsedQuery, RetrievedChunk
from multi_query import generate_query_variants, multi_query_retrieve, should_use_multi_query


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


def test_should_use_multi_query_disabled():
    """Multi-query is disabled when the flag is False."""
    assert should_use_multi_query("openai", False) is False


def test_should_use_multi_query_local_provider():
    """Multi-query is auto-disabled for local providers."""
    assert should_use_multi_query("local", True) is False


def test_should_use_multi_query_external_provider():
    """Multi-query is enabled for external providers when flag is True."""
    assert should_use_multi_query("openai", True) is True
    assert should_use_multi_query("ollama", True) is True


def test_generate_query_variants_success():
    """Generates multiple query variants from the LLM."""
    parsed = ParsedQuery(raw="sci-fi comics about space", semantic_keywords=["sci-fi", "comics", "space"])

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return "science fiction comic books about outer space\nspace opera comics and graphic novels\nbest sci-fi comics set in space"

    variants = generate_query_variants(parsed, generate_fn, num_variants=3)
    assert len(variants) >= 2  # Original + at least 1 variant
    assert parsed.embedding_text in variants  # Original is always included


def test_generate_query_variants_empty_response():
    """Returns only original query when LLM returns empty."""
    parsed = ParsedQuery(raw="test", semantic_keywords=["test"])

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return ""

    variants = generate_query_variants(parsed, generate_fn)
    assert variants == [parsed.embedding_text]


def test_generate_query_variants_exception():
    """Returns only original query when LLM raises exception."""
    parsed = ParsedQuery(raw="test", semantic_keywords=["test"])

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        raise RuntimeError("LLM unavailable")

    variants = generate_query_variants(parsed, generate_fn)
    assert variants == [parsed.embedding_text]


def test_generate_query_variants_strips_numbering():
    """Strips numbering and bullet prefixes from variant lines."""
    parsed = ParsedQuery(raw="test query", semantic_keywords=["test", "query"])

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return "1. first variant question\n2. second variant question\n- third variant question"

    variants = generate_query_variants(parsed, generate_fn, num_variants=3)
    assert len(variants) >= 2
    # No variant should start with a number or bullet
    for v in variants:
        if v != parsed.embedding_text:
            assert not v[0].isdigit()
            assert v[0] not in "-*#"


def test_multi_query_retrieve_fallback_single_variant():
    """Falls back to standard retrieval when only one variant."""
    parsed = ParsedQuery(raw="test", semantic_keywords=["test"])

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return ""  # No variants generated

    def retrieve_fn(embedding_text, book_ids, user_id, top_k):
        return [_chunk(1, "test result")], 10

    chunks, total = multi_query_retrieve(
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


def test_multi_query_retrieve_rrf_fusion():
    """Multiple variants produce RRF-fused results."""
    parsed = ParsedQuery(raw="sci-fi comics", semantic_keywords=["sci-fi", "comics"])

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return "science fiction comics\nspace opera graphic novels"

    # Simulate different results per variant
    call_count = [0]

    def retrieve_fn(embedding_text, book_ids, user_id, top_k):
        call_count[0] += 1
        if call_count[0] == 1:
            # Original query
            return [_chunk(1, "Galactic Warriors"), _chunk(2, "Starblade")], 100
        elif call_count[0] == 2:
            # First variant
            return [_chunk(2, "Starblade"), _chunk(3, "Nebula Knights")], 100
        else:
            # Second variant
            return [_chunk(1, "Galactic Warriors"), _chunk(3, "Nebula Knights")], 100

    chunks, total = multi_query_retrieve(
        query=parsed,
        retrieve_fn=retrieve_fn,
        generate_fn=generate_fn,
        book_ids=None,
        user_id=1,
        top_k=5,
    )
    assert len(chunks) >= 1
    assert total == 100
    # RRF scores should be set
    for chunk in chunks:
        assert chunk.rrf_score is not None
        assert chunk.rrf_score > 0
