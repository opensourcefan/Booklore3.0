"""Citation validation and marker generation.

Validates chunk IDs returned by the LLM against the retrieved set, then generates
human-readable source markers from the validated chunk metadata.
"""

from __future__ import annotations

from models import RetrievedChunk, ValidatedAnswerItem, AnswerItem


def validate_answer_items(
    items: list[AnswerItem],
    retrieved_chunks: list[RetrievedChunk],
) -> list[ValidatedAnswerItem]:
    """Validate LLM answer items against the retrieved chunk set.

    - Drops any chunk_id not present in retrieved_chunks.
    - Drops items that have no valid chunk IDs after validation.
    - Selects the highest-ranked retrieved chunk as the primary citation.
    """
    chunk_by_id = {c.chunk_id: c for c in retrieved_chunks}
    validated: list[ValidatedAnswerItem] = []

    for item in items:
        valid_chunks = [chunk_by_id[cid] for cid in item.chunk_ids if cid in chunk_by_id]
        if not valid_chunks:
            continue

        # Primary citation = highest-ranked (lowest rank number) chunk.
        primary = min(valid_chunks, key=lambda c: c.rank)
        supporting = [c for c in valid_chunks if c.chunk_id != primary.chunk_id]

        validated.append(
            ValidatedAnswerItem(
                text=item.text,
                primary_chunk=primary,
                supporting_chunks=supporting,
                confidence=item.confidence,
            )
        )

    return validated


def source_marker(chunk: RetrievedChunk) -> str:
    """Generate a human-readable citation marker."""
    page = chunk.page_number if chunk.page_number is not None else "N/A"
    return f"[Source: {chunk.book_title}, Page {page}]"


def render_answer_markdown(items: list[ValidatedAnswerItem]) -> str:
    """Render validated items as markdown with inline source markers."""
    lines: list[str] = []
    for item in items:
        marker = source_marker(item.primary_chunk)
        text = item.text.strip()
        if not text:
            continue
        # Avoid double punctuation before citation.
        if text[-1] in ".!?:":
            lines.append(f"- {text} {marker}")
        else:
            lines.append(f"- {text}. {marker}")
    return "\n".join(lines)
