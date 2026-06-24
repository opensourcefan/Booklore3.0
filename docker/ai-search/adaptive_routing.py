"""Adaptive RAG Routing stage.

Routes queries to the most appropriate retrieval strategy based on query
characteristics. Simple factoid queries use standard retrieval, while complex
multi-part queries benefit from decomposition or multi-query expansion.

This is a lightweight, non-LLM routing stage that uses heuristics based on
query length, presence of conjunctions, and question complexity markers.
"""

from __future__ import annotations

import logging
import re
from enum import Enum

from models import ParsedQuery

logger = logging.getLogger("fable-ai-search")


class RouteStrategy(Enum):
    """Available retrieval strategies."""
    STANDARD = "standard"
    HYDE = "hyde"
    MULTI_QUERY = "multi_query"
    DECOMPOSITION = "decomposition"


def route_query(
    query: ParsedQuery,
    hyde_enabled: bool = False,
    multi_query_enabled: bool = False,
    decomposition_enabled: bool = False,
    llm_provider: str = "local",
) -> list[RouteStrategy]:
    """Determine which retrieval strategies to apply for a query.

    Strategies are applied in order. Standard retrieval is always the fallback.

    Args:
        query: Parsed query.
        hyde_enabled: Whether HyDE is configured.
        multi_query_enabled: Whether multi-query is configured.
        decomposition_enabled: Whether decomposition is configured.
        llm_provider: LLM provider type (local/external).

    Returns:
        Ordered list of strategies to apply.
    """
    strategies: list[RouteStrategy] = []

    # All LLM-call strategies are auto-disabled for local providers
    can_use_llm = llm_provider != "local"

    # Analyze query complexity
    query_lower = query.raw.lower()
    word_count = len(query.raw.split())
    has_conjunction = bool(re.search(r'\b(and|or|also|plus|along with|as well as)\b', query_lower))
    has_comparison = bool(re.search(r'\b(vs|versus|compared to|better|worse|difference between)\b', query_lower))
    has_temporal = bool(re.search(r'\b(before|after|during|since|until|between \d+ and \d+)\b', query_lower))
    is_complex = has_conjunction or has_comparison or has_temporal or word_count > 12

    # Short, specific queries benefit from HyDE (expands query into document form)
    if can_use_llm and hyde_enabled and word_count <= 8 and not is_complex:
        strategies.append(RouteStrategy.HYDE)
        logger.info("Adaptive routing: HyDE selected for short query (%d words)", word_count)

    # Complex multi-part queries benefit from decomposition
    if can_use_llm and decomposition_enabled and is_complex:
        strategies.append(RouteStrategy.DECOMPOSITION)
        logger.info("Adaptive routing: Decomposition selected for complex query")

    # Medium-complexity queries benefit from multi-query expansion
    if can_use_llm and multi_query_enabled and not is_complex and word_count >= 4:
        strategies.append(RouteStrategy.MULTI_QUERY)
        logger.info("Adaptive routing: Multi-query selected for medium query (%d words)", word_count)

    # Standard retrieval is always the base strategy
    if not strategies:
        strategies.append(RouteStrategy.STANDARD)
        logger.info("Adaptive routing: Standard retrieval selected")

    return strategies
