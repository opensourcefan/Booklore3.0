"""Unit tests for hyde.py."""

from models import ParsedQuery
from hyde import generate_hypothetical_document, should_use_hyde


def test_should_use_hyde_disabled():
    """HyDE is disabled when the flag is False."""
    assert should_use_hyde("openai", False) is False


def test_should_use_hyde_local_provider():
    """HyDE is auto-disabled for local providers."""
    assert should_use_hyde("local", True) is False


def test_should_use_hyde_external_provider():
    """HyDE is enabled for external providers when flag is True."""
    assert should_use_hyde("openai", True) is True
    assert should_use_hyde("ollama", True) is True


def test_generate_hypothetical_document_success():
    """HyDE generates a hypothetical document from the LLM."""
    parsed = ParsedQuery(raw="sci-fi comics about space", semantic_keywords=["sci-fi", "comics", "space"])

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return "Science fiction comics about space exploration include titles like Galactic Warriors and Starblade Chronicles."

    result = generate_hypothetical_document(parsed, generate_fn)
    assert result is not None
    assert "Galactic Warriors" in result
    assert "Starblade" in result


def test_generate_hypothetical_document_empty_response():
    """HyDE returns None when LLM returns empty."""
    parsed = ParsedQuery(raw="test", semantic_keywords=["test"])

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return ""

    result = generate_hypothetical_document(parsed, generate_fn)
    assert result is None


def test_generate_hypothetical_document_whitespace_only():
    """HyDE returns None when LLM returns only whitespace."""
    parsed = ParsedQuery(raw="test", semantic_keywords=["test"])

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return "   \n  "

    result = generate_hypothetical_document(parsed, generate_fn)
    assert result is None


def test_generate_hypothetical_document_exception():
    """HyDE returns None when LLM raises an exception."""
    parsed = ParsedQuery(raw="test", semantic_keywords=["test"])

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        raise RuntimeError("LLM unavailable")

    result = generate_hypothetical_document(parsed, generate_fn)
    assert result is None
