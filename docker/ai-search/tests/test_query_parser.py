"""Unit tests for query_parser.py."""

import pytest
from query_parser import parse_query


def test_preserves_quoted_phrase():
    parsed = parse_query('list 5 "sci-fi" comics')
    assert parsed.required_phrases == ["sci-fi"]
    assert "sci-fi" in parsed.semantic_keywords or "sci" not in parsed.semantic_keywords


def test_compound_term_not_split():
    parsed = parse_query("d'artagnan and the musketeers")
    assert "d'artagnan" in parsed.semantic_keywords
    assert "artagnan" not in parsed.semantic_keywords


def test_requested_count_detected():
    parsed = parse_query("list five space comics")
    assert parsed.requested_count == 5
    assert parsed.intent == "list"


def test_summarize_intent():
    parsed = parse_query("summarize the plot of issue 1")
    assert parsed.intent == "summarize"


def test_fact_intent():
    parsed = parse_query("who created galactic warriors")
    assert parsed.intent == "fact"


def test_empty_query():
    parsed = parse_query("   ")
    assert parsed.raw == ""
    assert parsed.semantic_keywords == []
