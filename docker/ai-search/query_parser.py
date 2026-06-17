"""Query parsing stage.

Extracts required phrases, semantic keywords, requested counts, and query intent
while preserving compound terms like 'sci-fi' and 'd'artagnan'.
"""

from __future__ import annotations

import re

from models import ParsedQuery


# Minimal stopword list. We intentionally avoid over-pruning so that meaningful
# content words (e.g. 'comics', 'space') are retained.
_STOPWORDS = {
    "a", "an", "the", "in", "on", "at", "to", "for", "with", "by", "of", "and", "or", "but",
    "is", "are", "was", "were", "be", "been", "have", "has", "had", "do", "does", "did",
    "can", "could", "would", "should", "will", "shall", "may", "might", "must",
    "i", "me", "my", "you", "your", "we", "our", "they", "their", "them", "it", "its",
    "this", "that", "these", "those", "what", "which", "who", "where", "when", "why", "how",
}

_NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
}

_COMPOUND_PATTERN = re.compile(r"\b\w+(?:[-']\w+)+\b")
_PLAIN_WORD_PATTERN = re.compile(r"\b\w+\b")
_COUNT_PATTERN = re.compile(
    r"\b(?:list|show(?:\s+me)?|get|find|give\s+me|top)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b",
    re.IGNORECASE,
)


def parse_query(query: str) -> ParsedQuery:
    """Parse a raw user query into structured fields."""
    raw = query.strip()
    if not raw:
        return ParsedQuery(raw=raw)

    # 1. Required phrases: exact quoted strings, case-insensitive.
    required_phrases = [p.lower() for p in re.findall(r'"([^"]+)"', raw)]

    # 2. Text used for embedding: remove quotes but keep everything else.
    embedding_text = raw.replace('"', "").strip()

    # 3. Extract semantic keywords from embedding text.
    compounds = _COMPOUND_PATTERN.findall(embedding_text)
    remaining = _COMPOUND_PATTERN.sub(" ", embedding_text)
    plain = _PLAIN_WORD_PATTERN.findall(remaining)

    tokens = [t.lower() for t in compounds + plain if len(t) > 1]
    semantic_keywords = [t for t in tokens if t not in _STOPWORDS]

    # 4. Detect requested count.
    requested_count = _extract_count(raw)

    # 5. Detect intent.
    intent = _detect_intent(raw, requested_count)

    return ParsedQuery(
        raw=raw,
        required_phrases=required_phrases,
        semantic_keywords=semantic_keywords,
        requested_count=requested_count,
        intent=intent,
        embedding_text=embedding_text,
    )


def _extract_count(text: str) -> int | None:
    match = _COUNT_PATTERN.search(text)
    if not match:
        return None
    value = match.group(1).lower()
    if value.isdigit():
        return int(value)
    return _NUMBER_WORDS.get(value)


def _detect_intent(text: str, requested_count: int | None) -> str:
    lowered = text.lower()
    list_indicators = ["list", "show me", "give me", "top ", "what are", "what were"]
    summarize_indicators = ["summarize", "summary", "overview", "synopsis", "explain", "describe"]

    if requested_count is not None or any(ind in lowered for ind in list_indicators):
        return "list"
    if any(ind in lowered for ind in summarize_indicators):
        return "summarize"
    return "fact"
