"""Unit tests for reflection.py."""

from models import ParsedQuery, RetrievedChunk, AnswerItem
from reflection import reflect_on_answer, should_use_reflection


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


def test_should_use_reflection_disabled():
    """Reflection is disabled when the flag is False."""
    assert should_use_reflection("openai", False) is False


def test_should_use_reflection_local_provider():
    """Reflection is auto-disabled for local providers."""
    assert should_use_reflection("local", True) is False


def test_should_use_reflection_external_provider():
    """Reflection is enabled for external providers when flag is True."""
    assert should_use_reflection("openai", True) is True
    assert should_use_reflection("ollama", True) is True


def test_reflect_no_issues():
    """Returns no issues when LLM finds no problems."""
    parsed = ParsedQuery(raw="sci-fi comics", semantic_keywords=["sci-fi", "comics"])
    answer_items = [
        AnswerItem(text="Galactic Warriors is a sci-fi comic", chunk_ids=[42]),
    ]
    chunks = [_chunk(42, "Galactic Warriors is a science fiction comic by Joe Orlando.")]

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return '{"has_issues": false, "issues": [], "confidence": "high"}'

    result = reflect_on_answer(parsed, answer_items, chunks, generate_fn)
    assert result["has_issues"] is False
    assert result["issues"] == []
    assert result["confidence"] == "high"


def test_reflect_with_issues():
    """Returns issues when LLM finds problems."""
    parsed = ParsedQuery(raw="sci-fi comics", semantic_keywords=["sci-fi", "comics"])
    answer_items = [
        AnswerItem(text="Hallucinated fact not in sources", chunk_ids=[42]),
    ]
    chunks = [_chunk(42, "Galactic Warriors is a science fiction comic by Joe Orlando.")]

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return '{"has_issues": true, "issues": ["Claim not supported by source"], "confidence": "low"}'

    result = reflect_on_answer(parsed, answer_items, chunks, generate_fn)
    assert result["has_issues"] is True
    assert len(result["issues"]) >= 1
    assert result["confidence"] == "low"


def test_reflect_empty_answer_items():
    """Returns no issues when there are no answer items."""
    parsed = ParsedQuery(raw="test", semantic_keywords=["test"])
    result = reflect_on_answer(parsed, [], [], lambda *args, **kwargs: "")
    assert result["has_issues"] is False
    assert result["issues"] == []
    assert result["confidence"] == "medium"


def test_reflect_json_in_code_fence():
    """Parses JSON from markdown code fences."""
    parsed = ParsedQuery(raw="test", semantic_keywords=["test"])
    answer_items = [AnswerItem(text="A fact", chunk_ids=[1])]
    chunks = [_chunk(1, "A fact from the source.")]

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return '```json\n{"has_issues": false, "issues": [], "confidence": "high"}\n```'

    result = reflect_on_answer(parsed, answer_items, chunks, generate_fn)
    assert result["has_issues"] is False
    assert result["confidence"] == "high"


def test_reflect_parse_failure():
    """Returns safe defaults when JSON parsing fails."""
    parsed = ParsedQuery(raw="test", semantic_keywords=["test"])
    answer_items = [AnswerItem(text="A fact", chunk_ids=[1])]
    chunks = [_chunk(1, "A fact from the source.")]

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return "This is not valid JSON at all"

    result = reflect_on_answer(parsed, answer_items, chunks, generate_fn)
    assert result["has_issues"] is False
    assert result["issues"] == []
    assert result["confidence"] == "medium"


def test_reflect_empty_response():
    """Returns safe defaults when LLM returns empty."""
    parsed = ParsedQuery(raw="test", semantic_keywords=["test"])
    answer_items = [AnswerItem(text="A fact", chunk_ids=[1])]
    chunks = [_chunk(1, "A fact from the source.")]

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return ""

    result = reflect_on_answer(parsed, answer_items, chunks, generate_fn)
    assert result["has_issues"] is False
    assert result["issues"] == []
    assert result["confidence"] == "medium"
