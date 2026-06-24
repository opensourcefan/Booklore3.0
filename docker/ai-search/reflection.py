"""Self-Reflection stage.

After the LLM generates an answer, this stage asks the LLM to critique its own
answer for hallucinations, factual errors, and missing citations. If problems
are found, the answer is regenerated with stricter instructions.

When the LLM provider is local, self-reflection is automatically disabled to
avoid the extra LLM call overhead on CPU-bound small models.
"""

from __future__ import annotations

import logging
from typing import Callable

from models import ParsedQuery, RetrievedChunk, SynthesisResult, AnswerItem

logger = logging.getLogger("fable-ai-search")

_REFLECTION_SYSTEM_PROMPT = (
    "You are a strict fact-checker. Review the following answer that was generated "
    "from a set of source chunks. Your job is to identify any problems:\n\n"
    "1. Hallucinations: facts not supported by the sources.\n"
    "2. Missing citations: claims without a [ChunkID: N] reference.\n"
    "3. Contradictions: statements that conflict with the sources.\n"
    "4. Irrelevant information: content not related to the query.\n\n"
    "Return your analysis as a JSON object with these fields:\n"
    "- has_issues: true if any problems were found, false otherwise\n"
    "- issues: a list of strings describing each problem (empty if none)\n"
    "- confidence: 'high', 'medium', or 'low' based on answer quality\n\n"
    "Return ONLY the JSON object, no other text."
)


def reflect_on_answer(
    query: ParsedQuery,
    answer_items: list[AnswerItem],
    chunks: list[RetrievedChunk],
    generate_fn: Callable[[str, str, int, float, list[dict] | None, str | None], str],
    max_tokens: int = 256,
    temperature: float = 0.1,
) -> dict:
    """Ask the LLM to critique its own answer.

    Args:
        query: Parsed query.
        answer_items: The answer items to critique.
        chunks: The source chunks used to generate the answer.
        generate_fn: LLM generation function.
        max_tokens: Max tokens for reflection.
        temperature: Temperature (low for consistent critique).

    Returns:
        Dict with 'has_issues', 'issues', and 'confidence' keys.
    """
    if not answer_items:
        return {"has_issues": False, "issues": [], "confidence": "medium"}

    # Build a context showing the answer and its sources
    context_lines = ["Query: " + query.raw, "", "Answer to review:"]
    for i, item in enumerate(answer_items):
        context_lines.append(f"  {i + 1}. {item.text} [ChunkIDs: {item.chunk_ids}]")

    context_lines.append("")
    context_lines.append("Source chunks:")
    for chunk in chunks:
        context_lines.append(f"  [ChunkID: {chunk.chunk_id}] {chunk.text[:300]}...")

    context = "\n".join(context_lines)

    try:
        import json
        raw = generate_fn(
            query="Review the answer above for hallucinations and errors.",
            context=context,
            max_tokens=max_tokens,
            temperature=temperature,
            chat_history=None,
            system_prompt=_REFLECTION_SYSTEM_PROMPT,
        )
        if not raw or not raw.strip():
            return {"has_issues": False, "issues": [], "confidence": "medium"}

        # Parse JSON response
        # Try to extract JSON from code fences
        import re
        fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", raw, re.DOTALL)
        if fenced:
            raw = fenced.group(1)

        data = json.loads(raw)
        return {
            "has_issues": data.get("has_issues", False),
            "issues": data.get("issues", []),
            "confidence": data.get("confidence", "medium"),
        }
    except Exception as e:
        logger.warning("Self-reflection parsing failed: %s", e)
        return {"has_issues": False, "issues": [], "confidence": "medium"}


def should_use_reflection(llm_provider: str, reflection_enabled: bool) -> bool:
    """Determine whether self-reflection should be used.

    Self-reflection adds an extra LLM call, so it is automatically disabled when
    using a local provider to avoid excessive latency on CPU-bound small models.
    """
    if not reflection_enabled:
        return False
    if llm_provider == "local":
        logger.info("Self-reflection disabled: local LLM provider detected (extra LLM call would be too slow)")
        return False
    return True
