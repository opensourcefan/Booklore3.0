"""Pydantic data contracts for the AI Search pipeline.

These models define the explicit shape of data passed between stages.
They are intentionally flat and JSON-serializable so the public API
(/v1/search response) remains unchanged.
"""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field, ConfigDict


class Chunk(BaseModel):
    """A single stored chunk from a book."""

    chunk_id: int = Field(alias="chunkId")
    book_id: int = Field(alias="bookId")
    book_title: str = Field(alias="bookTitle")
    chunk_index: int = Field(alias="chunkIndex")
    text: str = Field(alias="chunkText")
    page_number: int | None = Field(alias="pageNumber", default=None)
    chapter_title: str | None = Field(alias="chapterTitle", default=None)
    context_before: str | None = Field(alias="contextBefore", default=None)
    context_after: str | None = Field(alias="contextAfter", default=None)

    # Retrieval scores (optional, depending on stage)
    similarity: float | None = None
    bm25_score: float | None = Field(alias="bm25Score", default=None)
    rerank_score: float | None = Field(alias="rerankScore", default=None)
    rrf_score: float | None = Field(alias="rrfScore", default=None)

    model_config = ConfigDict(populate_by_name=True)


class RetrievedChunk(Chunk):
    """A chunk that has been scored and ranked by the retrieval stage."""

    rank: int


class ParsedQuery(BaseModel):
    """Output of the query parsing stage."""

    raw: str
    required_phrases: list[str] = Field(default_factory=list)
    semantic_keywords: list[str] = Field(default_factory=list)
    requested_count: int | None = None
    intent: Literal["list", "summarize", "fact"] = "fact"
    embedding_text: str = ""


class AnswerItem(BaseModel):
    """One grounded fact/item returned by the LLM and validated by the system."""

    text: str
    chunk_ids: list[int] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "medium"


class SynthesisResult(BaseModel):
    """Structured output from the LLM synthesis stage."""

    items: list[AnswerItem] = Field(default_factory=list)
    summary: str | None = None
    no_relevant_info: bool = False


class ValidatedAnswerItem(BaseModel):
    """An answer item whose chunk IDs have been validated against retrieved chunks."""

    text: str
    primary_chunk: RetrievedChunk
    supporting_chunks: list[RetrievedChunk] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "medium"


class SearchResponse(BaseModel):
    """Public response shape for /v1/search. Fields match the existing API."""

    query: str
    results: list[dict[str, Any]] = Field(default_factory=list)
    answer: str | None = None
    answer_items: list[dict[str, Any]] | None = None
    error: str | None = None
    total_chunks_searched: int = 0
