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

    def generate_fn(query, context, max_tokens, temperature, chat_history=None):
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

    def generate_fn(query, context, max_tokens, temperature, chat_history=None):
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

    assert response.answer == "I could not find any relevant information for this search."
    assert response.results == []


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
