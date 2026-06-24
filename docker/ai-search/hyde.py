"""HyDE (Hypothetical Document Embeddings) stage.

Generates a hypothetical answer to the query, then uses that answer as the
embedding text for retrieval. This bridges the semantic gap between short
queries and document chunks by expanding the query into a document-like form.

When the LLM provider is local, HyDE is automatically disabled to avoid the
extra LLM call overhead on CPU-bound small models.
"""

from __future__ import annotations

import logging
from typing import Callable

from models import ParsedQuery

logger = logging.getLogger("fable-ai-search")

_HYDE_SYSTEM_PROMPT = (
    "You are a helpful assistant. Write a short paragraph that answers the user's question. "
    "Write only the paragraph, no preamble, no commentary. "
    "The paragraph should be 2-4 sentences long and sound like it came from a book or encyclopedia."
)


def generate_hypothetical_document(
    query: ParsedQuery,
    generate_fn: Callable[[str, str, int, float, list[dict] | None, str | None], str],
    max_tokens: int = 256,
    temperature: float = 0.3,
) -> str | None:
    """Generate a hypothetical document for the query.

    Args:
        query: Parsed query.
        generate_fn: LLM generation function.
        max_tokens: Max tokens for the hypothetical document.
        temperature: Temperature for generation.

    Returns:
        Hypothetical document text, or None if generation fails.
    """
    try:
        # Use a minimal context — HyDE doesn't need real context, it generates
        # a hypothetical answer from the model's own knowledge.
        hypo = generate_fn(
            query=query.raw,
            context="",
            max_tokens=max_tokens,
            temperature=temperature,
            chat_history=None,
            system_prompt=_HYDE_SYSTEM_PROMPT,
        )
        if hypo and hypo.strip():
            logger.info(
                "HyDE generated hypothetical document (%d chars) for query: %s",
                len(hypo), query.raw[:80],
            )
            return hypo.strip()
        else:
            logger.warning("HyDE generated empty response for query: %s", query.raw[:80])
            return None
    except Exception as e:
        logger.error("HyDE generation failed: %s", e)
        return None


def should_use_hyde(llm_provider: str, hyde_enabled: bool) -> bool:
    """Determine whether HyDE should be used.

    HyDE adds an extra LLM call, so it is automatically disabled when using
    a local provider to avoid excessive latency on CPU-bound small models.
    """
    if not hyde_enabled:
        return False
    if llm_provider == "local":
        logger.info("HyDE disabled: local LLM provider detected (extra LLM call would be too slow)")
        return False
    return True
