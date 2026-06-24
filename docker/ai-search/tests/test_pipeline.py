"""Integration test for the new AI Search pipeline with mocked dependencies."""

import json
from models import RetrievedChunk
from pipeline import run_search_pipeline


def _chunk(chunk_id: int, text: str, page: int = 1) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        book_id=1,
        book_title="100 All-Time Greatest Comics",
        chunk_index=chunk_id,
        text=text,
        page_number=page,
        rank=chunk_id,
    )


def test_pipeline_returns_validated_answer():
    chunks = [
        _chunk(42, "Galactic Warriors is a science fiction comic by Joe Orlando.", 168),
        _chunk(43, "The Starblade chronicles interstellar trade routes.", 169),
    ]

    def retrieve_fn(embedding_text, book_ids, user_id, top_k):
        return chunks, 100

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        # Simulate a well-behaved LLM returning structured JSON.
        return json.dumps({
            "items": [
                {"text": "Galactic Warriors by Joe Orlando", "chunk_ids": [42], "confidence": "high"},
                {"text": "The Starblade saga covers trade routes", "chunk_ids": [43], "confidence": "medium"},
            ],
            "no_relevant_info": False,
        })

    response = run_search_pipeline(
        query="list 5 sci-fi comics",
        book_ids=[1],
        user_id=1,
        retrieve_fn=retrieve_fn,
        generate_fn=generate_fn,
        top_k=5,
        display_top_k=5,
    )

    assert response.answer is not None
    assert "Galactic Warriors" in response.answer
    assert "[Source: 100 All-Time Greatest Comics, Page 168]" in response.answer
    assert "[Source: 100 All-Time Greatest Comics, Page 169]" in response.answer
    # Count disclaimer should not say 0 matches.
    assert "only found 0" not in (response.answer or "")
    # Missing keyword should not claim sci-fi is absent.
    assert '"sci-fi"' not in (response.answer or "")


def test_pipeline_falls_back_to_raw_when_llm_returns_no_info():
    chunks = [_chunk(42, "Some unrelated text.", 10)]

    def retrieve_fn(embedding_text, book_ids, user_id, top_k):
        return chunks, 50

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return json.dumps({"items": [], "no_relevant_info": True})

    response = run_search_pipeline(
        query="list 5 sci-fi comics",
        book_ids=[1],
        user_id=1,
        retrieve_fn=retrieve_fn,
        generate_fn=generate_fn,
        top_k=5,
        display_top_k=5,
    )

    # When the LLM claims no relevant info but chunks were retrieved, we still
    # return the chunks as a fallback with an honest disclaimer.
    assert response.answer is not None
    assert "Some unrelated text." in response.answer
    assert len(response.results) == 1
    assert response.results[0]["chunkId"] == 42
    assert "could not find the term(s)" in response.answer


def test_pipeline_local_only_returns_raw():
    chunks = [_chunk(42, "Galactic Warriors...", 168)]

    def retrieve_fn(embedding_text, book_ids, user_id, top_k):
        return chunks, 50

    response = run_search_pipeline(
        query="sci-fi comics",
        book_ids=[1],
        user_id=1,
        retrieve_fn=retrieve_fn,
        generate_fn=lambda *args, **kwargs: "",
        top_k=5,
        display_top_k=5,
        local_only=True,
    )

    assert response.answer is not None
    assert "Galactic Warriors" in response.answer
    assert len(response.results) == 1


def test_pipeline_with_compression_enabled():
    """Compression reduces chunk text to relevant sentences."""
    chunks = [
        _chunk(42, "Galactic Warriors is a science fiction comic. It was published in 1985. The author is Joe Orlando. The story follows space explorers. It won several awards.", 168),
    ]

    def retrieve_fn(embedding_text, book_ids, user_id, top_k):
        return chunks, 100

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return json.dumps({
            "items": [
                {"text": "Galactic Warriors by Joe Orlando", "chunk_ids": [42], "confidence": "high"},
            ],
            "no_relevant_info": False,
        })

    response = run_search_pipeline(
        query="science fiction comic",
        book_ids=[1],
        user_id=1,
        retrieve_fn=retrieve_fn,
        generate_fn=generate_fn,
        top_k=5,
        display_top_k=5,
        compression_enabled=True,
    )

    assert response.answer is not None
    assert "Galactic Warriors" in response.answer


def test_pipeline_rag_features_disabled_for_local_provider():
    """RAG features that add LLM calls are auto-disabled for local providers."""
    chunks = [
        _chunk(42, "Galactic Warriors is a science fiction comic by Joe Orlando.", 168),
    ]

    def retrieve_fn(embedding_text, book_ids, user_id, top_k):
        return chunks, 100

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        return json.dumps({
            "items": [
                {"text": "Galactic Warriors by Joe Orlando", "chunk_ids": [42], "confidence": "high"},
            ],
            "no_relevant_info": False,
        })

    response = run_search_pipeline(
        query="sci-fi comics",
        book_ids=[1],
        user_id=1,
        retrieve_fn=retrieve_fn,
        generate_fn=generate_fn,
        top_k=5,
        display_top_k=5,
        hyde_enabled=True,
        multi_query_enabled=True,
        decomposition_enabled=True,
        reflection_enabled=True,
        compression_enabled=True,
        llm_provider="local",
    )

    # Should still work — RAG features are silently disabled for local
    assert response.answer is not None
    assert "Galactic Warriors" in response.answer
    assert len(response.results) == 1


def test_pipeline_with_hyde_external_provider():
    """HyDE generates hypothetical document for embedding when using external LLM."""
    chunks = [
        _chunk(42, "Galactic Warriors is a science fiction comic by Joe Orlando.", 168),
    ]

    def retrieve_fn(embedding_text, book_ids, user_id, top_k):
        return chunks, 100

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        # HyDE call: system_prompt will be set for hypothetical doc generation
        if system_prompt and "short paragraph" in system_prompt:
            return "Science fiction comics about space exploration include titles like Galactic Warriors."
        # Synthesis call
        return json.dumps({
            "items": [
                {"text": "Galactic Warriors by Joe Orlando", "chunk_ids": [42], "confidence": "high"},
            ],
            "no_relevant_info": False,
        })

    response = run_search_pipeline(
        query="sci-fi comics",
        book_ids=[1],
        user_id=1,
        retrieve_fn=retrieve_fn,
        generate_fn=generate_fn,
        top_k=5,
        display_top_k=5,
        hyde_enabled=True,
        llm_provider="openai",
    )

    assert response.answer is not None
    assert "Galactic Warriors" in response.answer


def test_pipeline_with_self_reflection_retry():
    """Self-reflection triggers retry when issues are found."""
    chunks = [
        _chunk(42, "Galactic Warriors is a science fiction comic by Joe Orlando.", 168),
    ]

    def retrieve_fn(embedding_text, book_ids, user_id, top_k):
        return chunks, 100

    call_count = [0]

    def generate_fn(query, context, max_tokens, temperature, chat_history=None, system_prompt=None, **kwargs):
        call_count[0] += 1
        # First call: reflection (system_prompt contains "fact-checker")
        if system_prompt and "fact-checker" in system_prompt:
            return '{"has_issues": true, "issues": ["Claim not supported"], "confidence": "low"}'
        # Second call: initial synthesis
        if call_count[0] == 1:
            return json.dumps({
                "items": [
                    {"text": "Galactic Warriors by Joe Orlando", "chunk_ids": [42], "confidence": "high"},
                ],
                "no_relevant_info": False,
            })
        # Third call: retry synthesis with stricter prompt
        return json.dumps({
            "items": [
                {"text": "Galactic Warriors by Joe Orlando (verified)", "chunk_ids": [42], "confidence": "high"},
            ],
            "no_relevant_info": False,
        })

    response = run_search_pipeline(
        query="sci-fi comics",
        book_ids=[1],
        user_id=1,
        retrieve_fn=retrieve_fn,
        generate_fn=generate_fn,
        top_k=5,
        display_top_k=5,
        reflection_enabled=True,
        llm_provider="openai",
    )

    assert response.answer is not None
    assert "Galactic Warriors" in response.answer
    # Should have made at least 3 calls: synthesis + reflection + retry
    assert call_count[0] >= 3
