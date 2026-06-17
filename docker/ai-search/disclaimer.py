"""Disclaimer builder stage.

Produces honest, non-contradictory disclaimers about result counts and missing
keywords. Counts and missing terms are derived from the same data the UI renders.
"""

from __future__ import annotations

from models import ParsedQuery, RetrievedChunk, ValidatedAnswerItem


def build_disclaimer(
    parsed: ParsedQuery,
    validated_items: list[ValidatedAnswerItem],
    rendered_chunks: list[RetrievedChunk],
) -> str | None:
    """Build a disclaimer string, or None if no disclaimer is needed.

    The count is based on validated answer items (or retrieved chunks in RAW mode).
    Missing keywords are terms that appear in neither the rendered chunks nor the
    validated answer items.
    """
    parts: list[str] = []

    count = len(validated_items) if validated_items else len(rendered_chunks)

    if parsed.requested_count is not None and count < parsed.requested_count:
        parts.append(
            f"only found {count} match{'es' if count != 1 else ''} in your library "
            f"(not the {parsed.requested_count} requested)"
        )

    missing = _find_missing_keywords(parsed, validated_items, rendered_chunks)
    if missing:
        quoted = ", ".join(f'"{m}"' for m in missing)
        parts.append(f"could not find the term(s) {quoted}")

    if not parts:
        return None

    return "⚠️ *Note: I " + " and I ".join(parts) + ":*"


def _find_missing_keywords(
    parsed: ParsedQuery,
    validated_items: list[ValidatedAnswerItem],
    rendered_chunks: list[RetrievedChunk],
) -> list[str]:
    """Return keywords that are absent from both answer items and rendered chunks."""
    all_text = " ".join(
        [item.text.lower() for item in validated_items]
        + [c.text.lower() for c in rendered_chunks]
    )

    missing: list[str] = []
    for kw in parsed.required_phrases + parsed.semantic_keywords:
        kw_lower = kw.lower()
        if _keyword_present(kw_lower, all_text) or _synonym_present(kw_lower, all_text):
            continue
        missing.append(kw)

    return missing


def _keyword_present(keyword: str, text: str) -> bool:
    """Check if a keyword is present, including simple singular/plural variants."""
    if keyword in text:
        return True
    # Simple plural/singular normalization
    if keyword.endswith("s") and len(keyword) > 3:
        singular = keyword[:-1]
        if singular in text:
            return True
    if not keyword.endswith("s"):
        plural = keyword + "s"
        if plural in text:
            return True
    return False


def _synonym_present(keyword: str, text: str) -> bool:
    """Check for known synonyms of a keyword.

    Currently handles sci-fi / science fiction. Expand as needed.
    """
    synonyms = {
        "sci-fi": ["science fiction"],
        "science fiction": ["sci-fi"],
    }
    for synonym in synonyms.get(keyword, []):
        if synonym in text:
            return True
    return False
