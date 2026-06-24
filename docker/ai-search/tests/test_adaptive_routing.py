"""Unit tests for adaptive_routing.py."""

from models import ParsedQuery
from adaptive_routing import route_query, RouteStrategy


def test_standard_for_short_query_local_provider():
    """Short queries with local provider get standard routing only."""
    parsed = ParsedQuery(raw="sci-fi comics", semantic_keywords=["sci-fi", "comics"])
    strategies = route_query(
        query=parsed,
        hyde_enabled=True,
        multi_query_enabled=True,
        decomposition_enabled=True,
        llm_provider="local",
    )
    assert strategies == [RouteStrategy.STANDARD]


def test_hyde_for_short_query_external_provider():
    """Short queries with external provider get HyDE."""
    parsed = ParsedQuery(raw="sci-fi comics", semantic_keywords=["sci-fi", "comics"])
    strategies = route_query(
        query=parsed,
        hyde_enabled=True,
        multi_query_enabled=False,
        decomposition_enabled=False,
        llm_provider="openai",
    )
    assert RouteStrategy.HYDE in strategies


def test_multi_query_for_medium_query_external():
    """Medium-length queries with external provider get multi-query."""
    parsed = ParsedQuery(
        raw="what are the best science fiction comics about space exploration",
        semantic_keywords=["science", "fiction", "comics", "space", "exploration"],
    )
    strategies = route_query(
        query=parsed,
        hyde_enabled=False,
        multi_query_enabled=True,
        decomposition_enabled=False,
        llm_provider="openai",
    )
    assert RouteStrategy.MULTI_QUERY in strategies


def test_decomposition_for_complex_query():
    """Complex queries with conjunctions get decomposition."""
    parsed = ParsedQuery(
        raw="comics about time travel and parallel universes versus alternate dimensions",
        semantic_keywords=["comics", "time", "travel", "parallel", "universes"],
    )
    strategies = route_query(
        query=parsed,
        hyde_enabled=False,
        multi_query_enabled=False,
        decomposition_enabled=True,
        llm_provider="openai",
    )
    assert RouteStrategy.DECOMPOSITION in strategies


def test_decomposition_for_long_query():
    """Very long queries (>12 words) get decomposition."""
    parsed = ParsedQuery(
        raw="what are all the comic books that feature superhero teams fighting alien invasions in outer space",
        semantic_keywords=["comic", "books", "superhero", "teams", "alien", "invasions", "space"],
    )
    strategies = route_query(
        query=parsed,
        hyde_enabled=False,
        multi_query_enabled=False,
        decomposition_enabled=True,
        llm_provider="openai",
    )
    assert RouteStrategy.DECOMPOSITION in strategies


def test_comparison_triggers_decomposition():
    """Queries with comparison markers trigger decomposition."""
    parsed = ParsedQuery(
        raw="difference between marvel and dc comics",
        semantic_keywords=["difference", "marvel", "dc", "comics"],
    )
    strategies = route_query(
        query=parsed,
        hyde_enabled=False,
        multi_query_enabled=False,
        decomposition_enabled=True,
        llm_provider="openai",
    )
    assert RouteStrategy.DECOMPOSITION in strategies


def test_temporal_triggers_decomposition():
    """Queries with temporal markers trigger decomposition."""
    parsed = ParsedQuery(
        raw="comics published between 1980 and 1990",
        semantic_keywords=["comics", "published", "1980", "1990"],
    )
    strategies = route_query(
        query=parsed,
        hyde_enabled=False,
        multi_query_enabled=False,
        decomposition_enabled=True,
        llm_provider="openai",
    )
    assert RouteStrategy.DECOMPOSITION in strategies


def test_disabled_features_not_routed():
    """Disabled features are not included in routing."""
    parsed = ParsedQuery(raw="sci-fi comics", semantic_keywords=["sci-fi", "comics"])
    strategies = route_query(
        query=parsed,
        hyde_enabled=False,
        multi_query_enabled=False,
        decomposition_enabled=False,
        llm_provider="openai",
    )
    assert strategies == [RouteStrategy.STANDARD]


def test_hyde_not_for_complex_queries():
    """HyDE is not selected for complex queries even if enabled."""
    parsed = ParsedQuery(
        raw="comics about time travel and parallel universes versus alternate dimensions",
        semantic_keywords=["comics", "time", "travel"],
    )
    strategies = route_query(
        query=parsed,
        hyde_enabled=True,
        multi_query_enabled=False,
        decomposition_enabled=True,
        llm_provider="openai",
    )
    # HyDE should not be in strategies for complex queries
    assert RouteStrategy.HYDE not in strategies
    assert RouteStrategy.DECOMPOSITION in strategies


def test_standard_is_always_present():
    """Standard strategy is always the fallback when nothing else matches."""
    parsed = ParsedQuery(raw="hi", semantic_keywords=[])
    strategies = route_query(
        query=parsed,
        hyde_enabled=False,
        multi_query_enabled=False,
        decomposition_enabled=False,
        llm_provider="openai",
    )
    assert RouteStrategy.STANDARD in strategies
