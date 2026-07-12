# AI Search — Full Sequence of Events

> **Version:** v4.10.1  
> **Last updated:** 2026-06-24  
> **Covers:** Search button press → result rendered in UI  
> **Status legend:** `⏳ IN PROGRESS` · `✅ COMPLETED` · `⛔ DISABLED` · `⚠️ FAILED`

---

## 1. Angular UI — Search Initiation

| # | Event | File | Status |
|---|-------|------|--------|
| 1.1 | User presses Enter or clicks the search button in the AI Search dialog | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:540) | — |
| 1.2 | Query validated: length ≥ 2 characters; if shorter, search is silently rejected | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:541) | `⛔ DISABLED` if query < 2 chars |
| 1.3 | Any in-flight HTTP request is cancelled (`searchSub.unsubscribe()`) to prevent stale responses stacking | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:549) | `⏳ IN PROGRESS` → `✅ COMPLETED` |
| 1.4 | `isLoading = true`, `hasSearched = true` set on the dialog | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:551) | `⏳ IN PROGRESS` |
| 1.5 | `searchActive$` BehaviorSubject emits `true` (topbar spinner, book-searcher button state) | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:553) | `⏳ IN PROGRESS` |
| 1.6 | `searchError$` BehaviorSubject emits `false` (clears any previous error state) | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:554) | `✅ COMPLETED` |
| 1.7 | New `ChatMessage` object created with `isLoading: true`, pushed to `chatHistory` array | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:557) | `⏳ IN PROGRESS` |
| 1.8 | Chat history trimmed to last 3 turns to avoid context window overload | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:568) | `✅ COMPLETED` |
| 1.9 | Input box cleared immediately for responsive feel | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:573) | `✅ COMPLETED` |
| 1.10 | State saved to `localStorage` (query, answers, slim source refs, book scope — full `chunkText` omitted) | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts) | `✅ COMPLETED` |
| 1.11 | Chat history payload built: last 3 completed Q&A pairs as `[{role, content}]` | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:592) | `✅ COMPLETED` |
| 1.12 | `localOnly` flag read from dialog toggle state | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:601) | `⛔ DISABLED` if toggle off |
| 1.13 | HTTP POST to `/api/v1/ai/search/query` with `{query, bookIds, userId, chatHistory, localOnly}` | [`app-settings.service.ts`](fable-ui/src/app/shared/service/app-settings.service.ts:134) | `⏳ IN PROGRESS` |

---

## 2. Spring Boot — API Gateway

| # | Event | File | Status |
|---|-------|------|--------|
| 2.1 | `AiSearchController.search()` receives POST at `/api/v1/ai/search/query` | [`AiSearchController.java`](fable-api/src/main/java/org/fable/controller/AiSearchController.java:77) | `⏳ IN PROGRESS` |
| 2.2 | Extracts `query`, `bookIds`, `userId`, `chatHistory`, `localOnly` from JSON body | [`AiSearchController.java`](fable-api/src/main/java/org/fable/controller/AiSearchController.java:79) | `✅ COMPLETED` |
| 2.3 | Validates: query must be non-blank, userId must be present | [`AiSearchController.java`](fable-api/src/main/java/org/fable/controller/AiSearchController.java:95) | `⚠️ FAILED` if invalid |
| 2.4 | Delegates to `AiSearchService.search(query, bookIds, userId, chatHistory, localOnly)` | [`AiSearchController.java`](fable-api/src/main/java/org/fable/controller/AiSearchController.java:102) | `⏳ IN PROGRESS` |
| 2.5 | `AiSearchService` reads current `AiSearchSettings` from database via `AppSettingService` | [`AiSearchService.java`](fable-api/src/main/java/org/fable/service/ai/AiSearchService.java:346) | `✅ COMPLETED` |
| 2.6 | Assembles JSON payload with all config: `topK`, `displayTopK`, `similarityThreshold`, `maxTokens`, `temperature`, `matryoshkaDimensions`, `hybridSearchEnabled`, `rrfK`, `rerankingEnabled`, `rerankerModel`, `localOnly` | [`AiSearchService.java`](fable-api/src/main/java/org/fable/service/ai/AiSearchService.java:348) | `✅ COMPLETED` |
| 2.7 | Uses search-specific `RestClient` with 2-minute read timeout (vs. 10-minute for embedding) | [`AiSearchService.java`](fable-api/src/main/java/org/fable/service/ai/AiSearchService.java:344) | `⏳ IN PROGRESS` |
| 2.8 | POSTs assembled payload to `http://fable-ai-search:8080/v1/search` | [`AiSearchService.java`](fable-api/src/main/java/org/fable/service/ai/AiSearchService.java:368) | `⏳ IN PROGRESS` |
| 2.9 | On connection failure: returns error map with `error` field and empty results | [`AiSearchService.java`](fable-api/src/main/java/org/fable/service/ai/AiSearchService.java:370) | `⚠️ FAILED` |

---

## 3. Python FastAPI — Search Endpoint

| # | Event | File | Status |
|---|-------|------|--------|
| 3.1 | `/v1/search` endpoint receives POST body | [`app.py`](docker/ai-search/app.py:1255) | `⏳ IN PROGRESS` |
| 3.2 | Extracts all parameters: `query`, `bookIds`, `userId`, `topK`, `displayTopK`, `similarityThreshold`, `maxTokens`, `temperature`, `chatHistory`, `localOnly`, `hybridSearchEnabled`, `rrfK`, `rerankingEnabled` | [`app.py`](docker/ai-search/app.py:1258) | `✅ COMPLETED` |
| 3.3 | Validates: query must be non-empty, userId must be present | [`app.py`](docker/ai-search/app.py:1273) | `⚠️ FAILED` if invalid |
| 3.4 | Exact phrase parsing: extracts double-quoted phrases → `required_keywords` | [`app.py`](docker/ai-search/app.py:1279) | `✅ COMPLETED` |
| 3.5 | Strips quotes from embedding query text | [`app.py`](docker/ai-search/app.py:1280) | `✅ COMPLETED` |
| 3.6 | Extracts core keywords (filters ~100 stopwords: "the", "what", "find", "show", etc.) | [`app.py`](docker/ai-search/app.py:1316) | `✅ COMPLETED` |
| 3.7 | Detects index/TOC intent: `"index" in query.lower() or "table of contents" in query.lower()` | [`app.py`](docker/ai-search/app.py:1339) | `✅ COMPLETED` |
| 3.8 | Builds `retrieve_fn` closure wrapping `retrieval.py` with all search parameters | [`app.py`](docker/ai-search/app.py:1322) | `✅ COMPLETED` |
| 3.9 | Calls `run_search_pipeline()` with all parameters including RAG flags from global config | [`app.py`](docker/ai-search/app.py:1345) | `⏳ IN PROGRESS` |
| 3.10 | On pipeline exception: returns error response with `error` field and empty results | [`app.py`](docker/ai-search/app.py:1365) | `⚠️ FAILED` |

---

## 4. Pipeline — Stage 0: Adaptive Routing

| # | Event | File | Status |
|---|-------|------|--------|
| 4.1 | Determines `can_use_llm = llm_provider != "local"` — gates all LLM-call strategies | [`pipeline.py`](docker/ai-search/pipeline.py:91) | `⛔ DISABLED` if local provider |
| 4.2 | Computes effective flags: `effective_hyde`, `effective_multi_query`, `effective_decomposition`, `effective_reflection` | [`pipeline.py`](docker/ai-search/pipeline.py:92) | `⛔ DISABLED` if local provider |
| 4.3 | Calls `route_query()` — heuristic analysis of query characteristics (no LLM call) | [`adaptive_routing.py`](docker/ai-search/adaptive_routing.py:30) | `✅ COMPLETED` |
| 4.4 | Analyzes: query length, conjunctions ("and", "or", "vs"), comparison words ("difference", "compare"), temporal markers ("when", "year") | [`adaptive_routing.py`](docker/ai-search/adaptive_routing.py:30) | `✅ COMPLETED` |
| 4.5 | Returns set of `RouteStrategy` enums: `STANDARD`, `HYDE`, `MULTI_QUERY`, `DECOMPOSITION` | [`pipeline.py`](docker/ai-search/pipeline.py:98) | `✅ COMPLETED` |

---

## 5. Pipeline — Stage 1: HyDE (Hypothetical Document Embeddings)

| # | Event | File | Status |
|---|-------|------|--------|
| 5.1 | Checks `RouteStrategy.HYDE in strategies` | [`pipeline.py`](docker/ai-search/pipeline.py:108) | `⛔ DISABLED` if not in strategy set |
| 5.2 | Calls `generate_hypothetical_document()` — asks LLM to write a short answer to the query | [`hyde.py`](docker/ai-search/hyde.py:27) | `⏳ IN PROGRESS` |
| 5.3 | LLM generates synthetic answer document (max 256 tokens, temperature 0.3) | [`hyde.py`](docker/ai-search/hyde.py:44) | `✅ COMPLETED` / `⚠️ FAILED` |
| 5.4 | If successful: replaces `embedding_text` with the hypothetical document for better embedding matching | [`pipeline.py`](docker/ai-search/pipeline.py:117) | `✅ COMPLETED` |
| 5.5 | If failed: falls back to original query text for embedding | [`hyde.py`](docker/ai-search/hyde.py:66) | `⚠️ FAILED` → fallback |

---

## 6. Pipeline — Stage 2: Retrieval

| # | Event | File | Status |
|---|-------|------|--------|
| 6.1 | **Path A (Standard):** `RouteStrategy.STANDARD` — single embedding + cosine similarity search | [`pipeline.py`](docker/ai-search/pipeline.py:142) | `⏳ IN PROGRESS` |
| 6.2 | **Path B (Multi-Query):** `RouteStrategy.MULTI_QUERY` — generates 3 query variants via LLM, retrieves for each, fuses with RRF | [`multi_query.py`](docker/ai-search/multi_query.py:101) | `⛔ DISABLED` if not in strategy set |
| 6.3 | **Path C (Decomposition):** `RouteStrategy.DECOMPOSITION` — breaks query into 2-4 sub-queries via LLM, retrieves for each, fuses with RRF | [`decomposition.py`](docker/ai-search/decomposition.py:94) | `⛔ DISABLED` if not in strategy set |
| 6.4 | Embedding vector computed via `SentenceTransformer` for query text (or HyDE text) | [`retrieval.py`](docker/ai-search/retrieval.py) | `⏳ IN PROGRESS` |
| 6.5 | MariaDB queried for stored embeddings matching `bookIds` and `userId` | [`retrieval.py`](docker/ai-search/retrieval.py) | `⏳ IN PROGRESS` |
| 6.6 | Cosine similarity computed between query vector and each stored chunk vector | [`retrieval.py`](docker/ai-search/retrieval.py) | `⏳ IN PROGRESS` |
| 6.7 | Results filtered by `similarityThreshold` | [`retrieval.py`](docker/ai-search/retrieval.py) | `✅ COMPLETED` |
| 6.8 | If `hybridSearchEnabled`: BM25 keyword scores computed and fused with vector scores via RRF (k=60) | [`retrieval.py`](docker/ai-search/retrieval.py) | `⛔ DISABLED` if toggle off |
| 6.9 | If `rerankingEnabled`: top candidates passed through cross-encoder reranker model | [`retrieval.py`](docker/ai-search/retrieval.py) | `⛔ DISABLED` if toggle off |
| 6.10 | Matryoshka dimension truncation applied if configured (e.g., slice 768-dim → 256-dim) | [`retrieval.py`](docker/ai-search/retrieval.py) | `⛔ DISABLED` if dimensions = 0 |
| 6.11 | Top-K `RetrievedChunk` objects returned with scores, page numbers, book titles | [`pipeline.py`](docker/ai-search/pipeline.py:150) | `✅ COMPLETED` |

---

## 7. Pipeline — Stage 3: Contextual Compression

| # | Event | File | Status |
|---|-------|------|--------|
| 7.1 | Checks `compression_enabled and retrieved` | [`pipeline.py`](docker/ai-search/pipeline.py:156) | `⛔ DISABLED` if toggle off or no results |
| 7.2 | Splits each chunk into sentences, scores by keyword overlap with query | [`compression.py`](docker/ai-search/compression.py:22) | `⏳ IN PROGRESS` |
| 7.3 | Keeps top 50% most relevant sentences per chunk (minimum 2 sentences) | [`compression.py`](docker/ai-search/compression.py:22) | `✅ COMPLETED` |
| 7.4 | Non-LLM: zero additional LLM calls, works with any provider | — | `✅ COMPLETED` |

---

## 8. Pipeline �� Stage 4: Chunk Quality Filter

| # | Event | File | Status |
|---|-------|------|--------|
| 8.1 | `apply_chunk_filter()` runs on all retrieved chunks | [`chunk_filter.py`](docker/ai-search/chunk_filter.py) | `⏳ IN PROGRESS` |
| 8.2 | Filters out: heading-only fragments, TOC entries, title lists, legal/copyright boilerplate, garbage-spaced text, advertisements | [`chunk_filter.py`](docker/ai-search/chunk_filter.py) | `✅ COMPLETED` |
| 8.3 | Safety valve: if filtering would remove ALL chunks, keeps everything to avoid empty results | [`chunk_filter.py`](docker/ai-search/chunk_filter.py) | `✅ COMPLETED` |
| 8.4 | Display chunks trimmed to `displayTopK` from filtered pool | [`pipeline.py`](docker/ai-search/pipeline.py:173) | `✅ COMPLETED` |

---

## 9. Pipeline — Stage 5: Synthesis (LLM Answer Generation)

| # | Event | File | Status |
|---|-------|------|--------|
| 9.1 | Checks `localOnly` — if true, skips synthesis entirely, returns raw chunks | [`pipeline.py`](docker/ai-search/pipeline.py:178) | `⛔ DISABLED` if localOnly |
| 9.2 | Checks `filtered_chunks` — if empty, skips synthesis | [`pipeline.py`](docker/ai-search/pipeline.py:178) | `⛔ DISABLED` if no chunks |
| 9.3 | Builds context string from filtered chunks with chunk IDs | [`synthesis.py`](docker/ai-search/synthesis.py) | `✅ COMPLETED` |
| 9.4 | Sends to LLM with system prompt: "Answer ONLY from Context, cite [ChunkID: N], return markdown bullets" | [`synthesis.py`](docker/ai-search/synthesis.py) | `⏳ IN PROGRESS` |
| 9.5 | LLM generates answer | [`app.py`](docker/ai-search/app.py:474) `_generate_answer()` | `✅ COMPLETED` / `⚠️ FAILED` |
| 9.6 | Parses LLM response into structured `AnswerItem` objects | [`synthesis.py`](docker/ai-search/synthesis.py) | `✅ COMPLETED` |
| 9.7 | Validates citations: drops items citing non-existent chunk IDs | [`citation.py`](docker/ai-search/citation.py) | `✅ COMPLETED` |
| 9.8 | Recovers missing citations by text overlap matching against chunks | [`synthesis.py`](docker/ai-search/synthesis.py) | `✅ COMPLETED` |
| 9.9 | Deduplicates near-duplicate items from the same chunk | [`app.py`](docker/ai-search/app.py:1100) `_deduplicate_same_chunk_items()` | `✅ COMPLETED` |
| 9.10 | Strips hallucinated items (no citation AND no text overlap with any chunk) | [`app.py`](docker/ai-search/app.py:1201) `_strip_hallucinated_items()` | `✅ COMPLETED` |
| 9.11 | If sentinel "no relevant info" triggered: marks `no_relevant_info = true` | [`synthesis.py`](docker/ai-search/synthesis.py) | `✅ COMPLETED` |

---

## 10. Pipeline — Stage 6: Self-Reflection

| # | Event | File | Status |
|---|-------|------|--------|
| 10.1 | Checks `effective_reflection and validated_items and not localOnly` | [`pipeline.py`](docker/ai-search/pipeline.py:196) | `⛔ DISABLED` if local provider, no items, or localOnly |
| 10.2 | Calls `reflect_on_answer()` — asks LLM to critique its own answer for hallucinations, missing citations, factual errors, relevance issues | [`reflection.py`](docker/ai-search/reflection.py:35) | `⏳ IN PROGRESS` |
| 10.3 | LLM returns critique with `has_issues`, `issues[]`, `confidence` score | [`reflection.py`](docker/ai-search/reflection.py:71) | `✅ COMPLETED` / `⚠️ FAILED` |
| 10.4 | If `has_issues == false`: keeps original answer, no retry | [`pipeline.py`](docker/ai-search/pipeline.py:206) | `✅ COMPLETED` |
| 10.5 | If `has_issues == true`: regenerates answer with stricter system prompt (includes specific issues) and lower temperature (≤0.05) | [`pipeline.py`](docker/ai-search/pipeline.py:212) | `⏳ IN PROGRESS` |
| 10.6 | Retry synthesis runs with same chunks but stricter instructions | [`pipeline.py`](docker/ai-search/pipeline.py:219) | `✅ COMPLETED` / `⚠️ FAILED` |
| 10.7 | If retry produces items: replaces original `validated_items` | [`pipeline.py`](docker/ai-search/pipeline.py:230) | `✅ COMPLETED` |

---

## 11. Pipeline — Stage 7: Final Assembly

| # | Event | File | Status |
|---|-------|------|--------|
| 11.1 | If sentinel triggered: returns empty results with "I could not find any relevant information" | [`pipeline.py`](docker/ai-search/pipeline.py:237) | `✅ COMPLETED` |
| 11.2 | If `localOnly`: returns raw chunk text as answer (no LLM synthesis) | [`pipeline.py`](docker/ai-search/pipeline.py:244) | `✅ COMPLETED` |
| 11.3 | If validated items exist: renders them as markdown with citations via `render_answer_markdown()` | [`pipeline.py`](docker/ai-search/pipeline.py:250) | `✅ COMPLETED` |
| 11.4 | Fallback: if synthesis failed but chunks exist, returns raw chunks as answer | [`pipeline.py`](docker/ai-search/pipeline.py:251) | `✅ COMPLETED` |

---

## 12. Pipeline — Stage 8: Disclaimer

| # | Event | File | Status |
|---|-------|------|--------|
| 12.1 | `build_disclaimer()` checks if result count < requested count | [`disclaimer.py`](docker/ai-search/disclaimer.py) | `✅ COMPLETED` |
| 12.2 | Notes missing keywords if query contained specific terms not found in results | [`disclaimer.py`](docker/ai-search/disclaimer.py) | `✅ COMPLETED` |
| 12.3 | Disclaimer prepended to answer text | [`pipeline.py`](docker/ai-search/pipeline.py:262) | `✅ COMPLETED` |

---

## 13. Pipeline — Response

| # | Event | File | Status |
|---|-------|------|--------|
| 13.1 | `SearchResponse` model built: `query`, `results`, `contextResults`, `answer`, `answerItems`, `totalChunksSearched` | [`pipeline.py`](docker/ai-search/pipeline.py:267) | `✅ COMPLETED` |
| 13.2 | Response serialized to JSON via `model_dump(by_alias=True)` | [`app.py`](docker/ai-search/app.py:1364) | `✅ COMPLETED` |
| 13.3 | JSON returned to Java `AiSearchService` as HTTP response | [`AiSearchService.java`](fable-api/src/main/java/org/fable/service/ai/AiSearchService.java:368) | `✅ COMPLETED` |

---

## 14. Spring Boot — Response Passthrough

| # | Event | File | Status |
|---|-------|------|--------|
| 14.1 | `AiSearchService` deserializes Python response into `Map<String, Object>` | [`AiSearchService.java`](fable-api/src/main/java/org/fable/service/ai/AiSearchService.java:368) | `✅ COMPLETED` |
| 14.2 | On exception: returns fallback map with `error` field and empty results | [`AiSearchService.java`](fable-api/src/main/java/org/fable/service/ai/AiSearchService.java:370) | `⚠️ FAILED` |
| 14.3 | Controller returns response map as JSON HTTP response to Angular | [`AiSearchController.java`](fable-api/src/main/java/org/fable/controller/AiSearchController.java:102) | `✅ COMPLETED` |

---

## 15. Angular UI — Result Rendering

| # | Event | File | Status |
|---|-------|------|--------|
| 15.1 | `searchWithAi().subscribe()` callback fires with `AiSearchResult` | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:601) | `✅ COMPLETED` |
| 15.2 | `isLoading = false` on dialog and current `ChatMessage` | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:603) | `✅ COMPLETED` |
| 15.3 | `ChatMessage` updated: `results`, `contextResults`, `answer`, `answerItems` populated | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:605) | `✅ COMPLETED` |
| 15.4 | Markdown answer pre-rendered to HTML with citation highlighting | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:609) | `✅ COMPLETED` |
| 15.5 | `searchActive$` emits `false` (topbar spinner stops, book-searcher button re-enables) | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:610) | `✅ COMPLETED` |
| 15.6 | `searchError$` emits `true` if backend error or no results, `false` otherwise | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:616) | `⚠️ FAILED` if error/no results |
| 15.7 | State saved to `localStorage` for persistence across dialog close/reopen (slim: no full passage bodies) | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts) | `✅ COMPLETED` |
| 15.8 | LLM warmed status checked (for startup polling) | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:623) | `✅ COMPLETED` |
| 15.9 | Chat area scrolled to bottom to show new result | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:625) | `✅ COMPLETED` |
| 15.10 | On HTTP error: `isLoading = false`, `lastError` set, `searchError$` emits `true` | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:630) | `⚠️ FAILED` |
| 15.11 | Citations rendered as clickable `[Source: Book Title, Page N]` links | [`ai-search-dialog.component.html`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.html) | `✅ COMPLETED` |
| 15.12 | Clicking a citation opens the book to that page in the reader | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:282) | `✅ COMPLETED` |
| 15.13 | Context results (all retrieved chunks) available in expandable section | [`ai-search-dialog.component.html`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.html) | `✅ COMPLETED` |
| 15.14 | User can create notebook annotations from any result or answer item | [`ai-search-dialog.component.ts`](fable-ui/src/app/features/book/components/ai-search-dialog/ai-search-dialog.component.ts:453) | `✅ COMPLETED` |

---

## LLM Call Count by Configuration

| Configuration | LLM Calls | Notes |
|--------------|-----------|-------|
| Local Only mode | 0 | Raw retrieval only, no LLM at all |
| Local LLM (Ollama) + all RAG off | 1 | Synthesis only |
| Local LLM + Compression on | 1 | Compression is non-LLM |
| External LLM + all RAG on | 4–7 | HyDE(1) + Multi-Query/Decomp(1) + Synthesis(1) + Reflection(1-2) + possible retry |
| External LLM + HyDE + Compression | 2 | HyDE(1) + Synthesis(1) |

> **Key:** Features that add LLM calls (HyDE, Multi-Query, Decomposition, Reflection) are **automatically disabled when using a local LLM provider** to prevent excessive latency on CPU-bound local models.
