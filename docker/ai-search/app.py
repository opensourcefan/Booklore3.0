import json
import logging
import math
import os
import re
import requests
import shutil
import threading
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any
import base64
import io
from PIL import Image
import pytesseract

import mysql.connector
import mysql.connector.pooling
import numpy as np
from fastapi import FastAPI, HTTPException
from sentence_transformers import SentenceTransformer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("fable-ai-search")

app = FastAPI()

# ---- Default Constants (single source of truth) ----
DEFAULT_EMBEDDING_MODEL = "BAAI/bge-base-en-v1.5"
DEFAULT_LLM_MODEL = "smollm2:360m"

# ---- Configuration ----
CONFIG_PATH = "/models/config.json"
AUTO_CLEANUP_MODELS = os.getenv("AUTO_CLEANUP_MODELS", "true").lower() == "true"

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error("Failed to load config.json: %s", e)
    return {}

_config = load_config()
EMBEDDING_PROVIDER = _config.get("embeddingProvider", "local")
EMBEDDING_API_KEY = _config.get("embeddingApiKey", "")
EMBEDDING_MODEL_NAME = _config.get("embeddingModel", DEFAULT_EMBEDDING_MODEL)
EXTERNAL_EMBEDDING_BASE_URL = _config.get("externalEmbeddingUrl", "")

LLM_PROVIDER = _config.get("llmProvider", "local")
LLM_API_KEY = _config.get("llmApiKey", "")
EXTERNAL_LLM_BASE_URL = _config.get("externalLlmUrl", "")
LLM_MODEL_NAME = _config.get("llmModel", DEFAULT_LLM_MODEL)
LLM_MAX_TOKENS = int(_config.get("maxTokens", 768))
LLM_TEMPERATURE = float(_config.get("temperature", 0.1))
SEARCH_TOP_K = int(_config.get("topK", 5))
SEARCH_SIMILARITY_THRESHOLD = float(_config.get("similarityThreshold", 0.3))

MATRYOSHKA_DIMENSIONS = int(_config.get("matryoshkaDimensions", 0))
HYBRID_SEARCH_ENABLED = _config.get("hybridSearchEnabled", False)
RRF_K = int(_config.get("rrfK", 60))
RERANKING_ENABLED = _config.get("rerankingEnabled", False)
RERANKER_MODEL_NAME = _config.get("rerankerModel", "BAAI/bge-reranker-base")

OCR_ENABLED = _config.get("ocrEnabled", True)
OCR_FALLBACK_ONLY = _config.get("ocrFallbackOnly", True)
OCR_LANGUAGE = _config.get("ocrLanguage", "eng")

# Database config
DB_HOST = os.getenv("DB_HOST", "mariadb")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_NAME = os.getenv("DB_NAME", "fable")
DB_USERNAME = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "fable")

# ---- State ----
_embedding_model: SentenceTransformer | None = None
_loading: bool = False
_load_error: str | None = None
_llm_loading: bool = False
_llm_load_error: str | None = None
_reranker_model: Any | None = None
_reranker_loading: bool = False
_reranker_load_error: str | None = None
_llm_warmed_cache: bool | None = None  # Cached to avoid live /api/ps calls during LLM generation
_load_lock = threading.Lock()
_active_embed_jobs: dict[str, dict[str, Any]] = {}
_active_embed_jobs_lock = threading.Lock()
_db_pool: mysql.connector.pooling.MySQLConnectionPool | None = None
_db_pool_lock = threading.Lock()
_load_retry_cooldown_secs = 60
_last_load_attempt_time: float | None = None


# ---- Database Connection Pool ----

def _init_db_pool() -> None:
    global _db_pool
    if _db_pool is not None:
        return
    with _db_pool_lock:
        if _db_pool is not None:
            return
        _db_pool = mysql.connector.pooling.MySQLConnectionPool(
            pool_name="fable_ai_pool",
            pool_size=5,
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USERNAME,
            password=DB_PASSWORD,
            charset="utf8mb4",
            connection_timeout=5,
        )


def _get_db_connection():
    _init_db_pool()
    return _db_pool.get_connection()


# ---- Embed Job Cleanup ----

_embed_job_ttl_secs = 3600  # 1 hour

def _cleanup_stale_embed_jobs() -> None:
    """Remove embed jobs older than TTL to prevent memory leak."""
    now = datetime.now(timezone.utc)
    with _active_embed_jobs_lock:
        stale_keys = [
            job_id for job_id, job in _active_embed_jobs.items()
            if "startedAt" in job
            and (now - datetime.fromisoformat(job["startedAt"])).total_seconds() > _embed_job_ttl_secs
        ]
        for key in stale_keys:
            _active_embed_jobs.pop(key, None)
        if stale_keys:
            logger.info("Cleaned up %d stale embed jobs", len(stale_keys))


def _cleanup_loop() -> None:
    """Background thread that periodically cleans up stale embed jobs."""
    while True:
        time.sleep(600)  # Run every 10 minutes
        _cleanup_stale_embed_jobs()


# ---- Model Loading ----

def _do_load() -> None:
    """Background thread: loads the embedding model."""
    global _embedding_model, _loading, _load_error, _last_load_attempt_time

    _last_load_attempt_time = time.time()

    if not EMBEDDING_MODEL_NAME:
        logger.info("No EMBEDDING_MODEL specified. Skipping local model load.")
        _loading = False
        return

    logger.info("Embedding model load started for %s", EMBEDDING_MODEL_NAME)
    with _load_lock:
        try:
            if AUTO_CLEANUP_MODELS:
                hf_home = os.getenv("HF_HOME", "/models/hf")
                hf_cache_dir = os.path.join(hf_home, "hub")
                if os.path.exists(hf_cache_dir):
                    target_folder = "models--" + EMBEDDING_MODEL_NAME.replace("/", "--")
                    reranker_folder = None
                    if RERANKING_ENABLED and RERANKER_MODEL_NAME:
                        reranker_folder = "models--" + RERANKER_MODEL_NAME.replace("/", "--")
                    
                    for folder in os.listdir(hf_cache_dir):
                        if folder.startswith("models--") and folder != target_folder and folder != reranker_folder:
                            folder_path = os.path.join(hf_cache_dir, folder)
                            logger.info("Removing unused HuggingFace model: %s", folder)
                            try:
                                shutil.rmtree(folder_path)
                            except Exception as e:
                                logger.error("Failed to remove unused model %s: %s", folder, e)

            _embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME, trust_remote_code=True)
            logger.info("Embedding model loaded successfully: %s", EMBEDDING_MODEL_NAME)
        except Exception as exc:
            _load_error = str(exc)
            logger.error("Embedding model load failed: %s", exc)
        finally:
            _loading = False


def _start_load_thread_locked() -> None:
    global _loading, _load_error
    _loading = True
    _load_error = None
    threading.Thread(target=_do_load, daemon=True).start()


def _do_llm_load() -> None:
    """Background thread: pulls the LLM model from Ollama if using local provider."""
    global _llm_loading, _llm_load_error

    if LLM_PROVIDER != "local" or not LLM_MODEL_NAME:
        _llm_loading = False
        return

    logger.info("LLM model pull started for %s", LLM_MODEL_NAME)
    try:
        resp = requests.post(
            "http://localhost:11434/api/pull",
            json={"name": LLM_MODEL_NAME, "stream": False},
            timeout=1800
        )
        resp.raise_for_status()
        logger.info("LLM model pulled successfully: %s. Warming up LLM in memory...", LLM_MODEL_NAME)
        
        # Warm up Ollama by triggering a dummy generate request
        try:
            requests.post(
                "http://localhost:11434/api/generate",
                json={"model": LLM_MODEL_NAME, "prompt": ""},
                timeout=300
            )
            logger.info("LLM model warmed up successfully: %s", LLM_MODEL_NAME)
        except Exception as warm_exc:
            logger.warning("LLM model warm-up failed: %s", warm_exc)

    except Exception as exc:
        _llm_load_error = str(exc)
        logger.error("LLM model pull failed: %s", exc)
    finally:
        _llm_loading = False


def _start_llm_load_thread_locked() -> None:
    global _llm_loading, _llm_load_error, _llm_warmed_cache
    _llm_loading = True
    _llm_load_error = None
    _llm_warmed_cache = None  # Invalidate cache when loading a new model
    threading.Thread(target=_do_llm_load, daemon=True).start()


def _do_reranker_load() -> None:
    """Background thread: loads the reranker model."""
    global _reranker_model, _reranker_loading, _reranker_load_error

    if not RERANKING_ENABLED or not RERANKER_MODEL_NAME:
        _reranker_loading = False
        return

    logger.info("Reranker model load started for %s", RERANKER_MODEL_NAME)
    with _load_lock:
        try:
            from sentence_transformers import CrossEncoder
            _reranker_model = CrossEncoder(RERANKER_MODEL_NAME, trust_remote_code=True)
            logger.info("Reranker model loaded successfully: %s", RERANKER_MODEL_NAME)
        except Exception as exc:
            _reranker_load_error = str(exc)
            logger.error("Reranker model load failed: %s", exc)
        finally:
            _reranker_loading = False


def _start_reranker_load_thread_locked() -> None:
    global _reranker_loading, _reranker_load_error
    _reranker_loading = True
    _reranker_load_error = None
    threading.Thread(target=_do_reranker_load, daemon=True).start()


def _ensure_loading() -> None:
    global _load_error
    with _load_lock:
        if RERANKING_ENABLED and _reranker_model is None and not _reranker_loading and not _reranker_load_error:
            logger.info("Triggering automatic background load for reranker: %s", RERANKER_MODEL_NAME)
            _start_reranker_load_thread_locked()

        if _embedding_model is not None or _loading:
            return

        # Self-heal: if previous load failed and cooldown passed, retry
        if _load_error is not None:
            if _last_load_attempt_time is not None:
                elapsed = time.time() - _last_load_attempt_time
                if elapsed < _load_retry_cooldown_secs:
                    return  # Still in cooldown
            _load_error = None  # Clear error to allow retry
            logger.info("Clearing previous load error and retrying after cooldown.")

        if not EMBEDDING_MODEL_NAME and EMBEDDING_PROVIDER == "local":
            return
        logger.info("Triggering automatic background load for %s", EMBEDDING_MODEL_NAME)
        _start_load_thread_locked()


def _get_embedding_model() -> SentenceTransformer:
    if _embedding_model is not None:
        return _embedding_model
    if _loading:
        raise RuntimeError("Embedding model is currently loading. Please try again shortly.")
    if _load_error:
        raise RuntimeError("Embedding model failed to load. Check server logs for details.")
    raise RuntimeError("Embedding model is not loaded.")


def _compute_embedding(text: str, retries: int = 3) -> list[float]:
    """Compute embedding vector for a text string.

    Retries with exponential backoff for external providers (openai/ollama).
    Local provider failures are considered permanent and are not retried.
    """
    vector = None
    if EMBEDDING_PROVIDER in ("openai", "ollama"):
        last_exception = None
        for attempt in range(retries):
            try:
                headers = {}
                if EMBEDDING_API_KEY:
                    headers["Authorization"] = f"Bearer {EMBEDDING_API_KEY}"

                base_url = EXTERNAL_EMBEDDING_BASE_URL.rstrip("/")
                if not base_url:
                    base_url = "https://api.openai.com/v1" if EMBEDDING_PROVIDER == "openai" else "http://localhost:11434/api"

                url = f"{base_url}/embeddings" if EMBEDDING_PROVIDER == "openai" else f"{base_url}/embeddings"

                if EMBEDDING_PROVIDER == "ollama" and "/api" not in base_url:
                    url = f"{base_url}/api/embeddings"

                json_payload = {"model": EMBEDDING_MODEL_NAME, "input": text}
                if EMBEDDING_PROVIDER == "openai" and "text-embedding-3" in EMBEDDING_MODEL_NAME and MATRYOSHKA_DIMENSIONS > 0:
                    json_payload["dimensions"] = MATRYOSHKA_DIMENSIONS

                if EMBEDDING_PROVIDER == "ollama":
                    json_payload = {"model": EMBEDDING_MODEL_NAME, "prompt": text}

                resp = requests.post(
                    url,
                    headers=headers,
                    json=json_payload,
                    timeout=30,
                )
                resp.raise_for_status()
                if EMBEDDING_PROVIDER == "ollama":
                    vector = resp.json()["embedding"]
                else:
                    vector = resp.json()["data"][0]["embedding"]
                break
            except Exception as exc:
                last_exception = exc
                if attempt < retries - 1:
                    wait = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                    logger.warning(
                        "Embedding attempt %d/%d failed, retrying in %ds: %s",
                        attempt + 1, retries, wait, exc,
                    )
                    time.sleep(wait)
        # All retries exhausted
        if vector is None:
            raise last_exception  # type: ignore[misc]

    else:
        model = _get_embedding_model()
        vector = model.encode(text, normalize_embeddings=True).tolist()

    # Apply Matryoshka dimension truncation and L2 re-normalization if enabled
    if MATRYOSHKA_DIMENSIONS > 0 and len(vector) > MATRYOSHKA_DIMENSIONS:
        vector = vector[:MATRYOSHKA_DIMENSIONS]
        norm = np.linalg.norm(vector)
        if norm > 0:
            vector = (vector / norm).tolist()

    return vector


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors (already normalized)."""
    return float(np.dot(a, b))


def _ensure_list_citations(answer: str, results: list[dict]) -> str:
    """Post-process an LLM answer so every list item ends with a correct source citation.

    The system prompt asks the model to append `[Source: Book Title, Page N]` to each
    fact or list item. Small local models often omit these markers or hallucinate the
    same page for every item. This function:

    1. Splits the answer into lines.
    2. For any line that looks like a list item (starts with `-`, `*`, or a number like
       `1.`) appends or replaces the citation with the source that actually matches the
       result slot.
    3. Cycles through results in order so each list item gets the next best source.
    4. Skips citation-only sub-bullets (e.g. "- Source: [Source 1: ...]") to prevent
       double-processing garbage.
    """
    if not results:
        return answer

    source_iter = iter(results)
    current_source = next(source_iter)

    def _source_marker(result: dict) -> str:
        page = result.get("pageNumber") or "N/A"
        return f"[Source: {result['bookTitle']}, Page {page}]"

    processed_lines = []
    list_item_pattern = re.compile(r"^\s*(?:[-*•]|\d+\.)\s+")
    # Matches lines that are purely a citation with no substantive content
    citation_only_pattern = re.compile(
        r"^\s*(?:[-*•]|\d+\.)\s*\[?Source\s*(?:\d+)?:\s*[^\]]*\]?\s*$",
        re.IGNORECASE
    )

    has_list_items = False
    for line in answer.split("\n"):
        stripped = line.strip()

        # Skip citation-only sub-bullets. These are LLM artifacts where the model
        # puts the citation on a separate line instead of inline. Processing them
        # would produce garbage like "Source: [Source: ...]".
        if citation_only_pattern.match(stripped):
            continue

        if list_item_pattern.match(stripped):
            has_list_items = True
            # Strip any existing (possibly wrong) citation so we can replace it with the
            # source that actually matches this result slot. Also normalize the context
            # block format [Source N: Book, Page, ChunkIndex] to [Source: Book, Page].
            stripped = re.sub(r"\s*\[Source\s*(?:\d+)?:\s*[^\]]*\]", "", stripped).strip()
            # Strip trailing dashes that LLMs sometimes append (e.g. "Galactic Warriors -").
            # Without this, the endswith check below misses the dash and we produce
            # "Galactic Warriors -. [Source: ...]" instead of "Galactic Warriors. [Source: ...]".
            stripped = re.sub(r"\s*[-–—]\s*$", "", stripped).strip()
            if stripped.endswith((".", "!", "?")):
                line = f"{stripped} {_source_marker(current_source)}"
            else:
                line = f"{stripped}. {_source_marker(current_source)}"
            try:
                current_source = next(source_iter)
            except StopIteration:
                # Reuse the last source if we run out; this keeps all remaining items cited.
                pass
        processed_lines.append(line)

    if not has_list_items:
        # Check if the entire answer already contains a citation to prevent duplicate citations
        if not re.search(r"\[Source\s*(?:\d+)?:\s*[^\]]*\]", answer):
            for i in range(len(processed_lines) - 1, -1, -1):
                line = processed_lines[i]
                stripped = line.strip()
                if stripped:
                    stripped = re.sub(r"\s*[-–—]\s*$", "", stripped).strip()
                    if stripped.endswith((".", "!", "?")):
                        processed_lines[i] = f"{stripped} {_source_marker(results[0])}"
                    else:
                        processed_lines[i] = f"{stripped}. {_source_marker(results[0])}"
                    break

    return "\n".join(processed_lines)


def _generate_answer(query: str, context: str, max_tokens: int, temperature: float, chat_history: list[dict] = None, system_prompt: str | None = None, **kwargs) -> str:
    """Generate an answer using the LLM (local Ollama or external)."""
    if not LLM_MODEL_NAME and LLM_PROVIDER == "local":
        raise RuntimeError("No LLM model configured.")

    headers = {}
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"

    if system_prompt is None:
        system_prompt = (
            "You are an AI search assistant. Read the provided Context carefully.\n"
            "Your task is to respond to the user's Query based ONLY on the Context. Do not use external knowledge.\n"
            "If the Context contains any information relevant to the Query, you MUST use it to answer the Query. Note that the Context is retrieved semantically, so the exact query terms (such as genre names like 'sci-fi' or 'vigilante') may not appear literally in the text. You should still use your understanding to connect the concepts and answer the query based on the retrieved context, and do NOT refuse to answer or claim the context lacks information.\n"
            "You MUST cite your sources for every fact or item using the exact format [Source: Book Title, Page N] inline at the end of the item.\n"
            "If the context contains absolutely no relevant information at all, reply EXACTLY with: 'I could not find any relevant information for this search.' and nothing else.\n"
            "\n"
            "RESPONSE FORMAT:\n"
            "- If the user asks for a list, use structured bullet points.\n"
            "- If the user asks for details or explanation, provide a thorough answer.\n"
            "- Otherwise, provide a balanced, moderate-length answer.\n"
            "\n"
            "CITATION RULES:\n"
            "- Each bullet point or fact MUST end with its own citation.\n"
            "- Use the page number from the Context block that the information came from.\n"
            "- Do NOT reuse the same page number for every item unless every item really came from that page.\n"
            "\n"
            "CITATION EXAMPLE:\n"
            "- \"Galactic Warriors\" by Joe Orlando [Source: 100 All-Time Greatest Comics, Page 98]\n"
            "- The Starblade chronicles the conflict over interstellar trade routes [Source: 100 All-Time Greatest Comics, Page 102]"
        )

    user_prompt = f"Context:\n{context}\n\nQuery: {query}"

    messages = [{"role": "system", "content": system_prompt}]
    if chat_history:
        messages.extend(chat_history)
    messages.append({"role": "user", "content": user_prompt})

    # LLM generation timeout. The large model (e.g. llama3.2) can take several
    # minutes to generate on CPU. 300s gives it enough time to complete while
    # still failing if Ollama is truly stuck. The Java search proxy uses a
    # longer timeout (330s) so that Python fails first and returns a graceful
    # RAW fallback, rather than the Java layer timing out.
    LLM_REQUEST_TIMEOUT = 300

    if LLM_PROVIDER == "openai":
        base_url = EXTERNAL_LLM_BASE_URL.rstrip("/") or "https://api.openai.com/v1"
        resp = requests.post(
            f"{base_url}/chat/completions",
            headers=headers,
            json={
                "model": LLM_MODEL_NAME,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            },
            timeout=LLM_REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    else:
        if LLM_PROVIDER == "local":
            base_url = "http://localhost:11434"
        else:
            base_url = EXTERNAL_LLM_BASE_URL.rstrip("/") or "http://localhost:11434"
        url = f"{base_url}/api/chat" if "/api" not in base_url else f"{base_url}/chat"
        logger.info(
            "LLM request: model=%s context_chars=%d query=%s",
            LLM_MODEL_NAME, len(context), query[:80]
        )
        t0 = time.time()
        resp = requests.post(
            url,
            headers=headers,
            json={
                "model": LLM_MODEL_NAME,
                "messages": messages,
                "stream": False,
                "options": {
                    "num_predict": max_tokens,
                    "temperature": temperature,
                    "repeat_penalty": 1.15,
                    "repeat_last_n": 128,
                },
            },
            timeout=LLM_REQUEST_TIMEOUT,
        )
        elapsed = time.time() - t0
        resp.raise_for_status()
        content = resp.json().get("message", {}).get("content", "")
        logger.info(
            "LLM response: model=%s elapsed=%.1fs content_chars=%d preview=%s",
            LLM_MODEL_NAME, elapsed, len(content),
            content[:200].replace("\n", "\\n") if content else "(EMPTY)"
        )
        if not content:
            logger.warning(
                "LLM returned empty content for model=%s query=%s — "
                "model may not be loaded or may have crashed during generation",
                LLM_MODEL_NAME, query[:80]
            )
        return content


# ---- API Endpoints ----

@app.on_event("startup")
def startup() -> None:
    # Start stale embed job cleanup background thread
    threading.Thread(target=_cleanup_loop, daemon=True).start()

    if EMBEDDING_PROVIDER != "local":
        logger.info("Using external provider %s for Embeddings", EMBEDDING_PROVIDER)
    elif EMBEDDING_MODEL_NAME:
        logger.info("Beginning background load for local embedding model: %s", EMBEDDING_MODEL_NAME)
        with _load_lock:
            _start_load_thread_locked()
    else:
        logger.info("No external or local embedding model configured.")

    if LLM_PROVIDER == "local" and LLM_MODEL_NAME:
        logger.info("Beginning background pull for local LLM model: %s", LLM_MODEL_NAME)
        with _load_lock:
            _start_llm_load_thread_locked()

    if RERANKING_ENABLED and RERANKER_MODEL_NAME:
        logger.info("Beginning background load for reranker: %s", RERANKER_MODEL_NAME)
        with _load_lock:
            _start_reranker_load_thread_locked()


@app.get("/health")
def health() -> dict[str, Any]:
    global _llm_warmed_cache
    _ensure_loading()
    # Check if the model has successfully finished loading into memory
    ready = _embedding_model is not None

    status = "ok"
    error = None

    if EMBEDDING_PROVIDER == "local":
        if _load_error is not None:
            status = "load_failed"
            error = _load_error
        elif not ready or _loading:
            status = "warming"

    if LLM_PROVIDER == "local":
        if _llm_load_error is not None:
            status = "load_failed"
            error = _llm_load_error
        elif _llm_loading:
            status = "warming"

    if RERANKING_ENABLED:
        if _reranker_load_error is not None:
            status = "load_failed"
            error = _reranker_load_error
        elif _reranker_model is None or _reranker_loading:
            status = "warming"

    llm_warmed = True
    if LLM_PROVIDER == "local" and LLM_MODEL_NAME:
        # Use cached value if already confirmed warmed — avoids live /api/ps
        # calls that can timeout when Ollama is busy generating a response.
        if _llm_warmed_cache is True:
            llm_warmed = True
        else:
            llm_warmed = False
            try:
                ps_resp = requests.get("http://localhost:11434/api/ps", timeout=5)
                if ps_resp.status_code == 200:
                    loaded_models = [m.get("name") for m in ps_resp.json().get("models", [])]
                    llm_warmed = any(
                        m == LLM_MODEL_NAME or
                        m.startswith(LLM_MODEL_NAME + ":") or
                        LLM_MODEL_NAME.startswith(m + ":")
                        for m in loaded_models
                    )
                    if llm_warmed:
                        _llm_warmed_cache = True
            except Exception:
                pass

    return {
        "status": status,
        "mock": False,
        "embeddingModel": EMBEDDING_MODEL_NAME,
        "loadError": error,
        "provider": EMBEDDING_PROVIDER,
        "llmWarmed": llm_warmed
    }


@app.post("/v1/config")
def update_config(payload: dict[str, Any]) -> dict[str, Any]:
    global _config, EMBEDDING_PROVIDER, EMBEDDING_API_KEY, LLM_PROVIDER, LLM_API_KEY, EMBEDDING_MODEL_NAME, EXTERNAL_EMBEDDING_BASE_URL, EXTERNAL_LLM_BASE_URL, LLM_MODEL_NAME, LLM_MAX_TOKENS, LLM_TEMPERATURE, SEARCH_TOP_K, SEARCH_SIMILARITY_THRESHOLD, _embedding_model, MATRYOSHKA_DIMENSIONS, HYBRID_SEARCH_ENABLED, RRF_K, RERANKING_ENABLED, RERANKER_MODEL_NAME, _reranker_model, OCR_ENABLED, OCR_FALLBACK_ONLY, OCR_LANGUAGE

    with _load_lock:
        try:
            os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
            with open(CONFIG_PATH, "w") as f:
                json.dump(payload, f, indent=2)
            _config = payload
            EMBEDDING_PROVIDER = _config.get("embeddingProvider", "local")
            EMBEDDING_API_KEY = _config.get("embeddingApiKey", "")
            LLM_PROVIDER = _config.get("llmProvider", "local")
            LLM_API_KEY = _config.get("llmApiKey", "")

            new_embedding_model = _config.get("embeddingModel", DEFAULT_EMBEDDING_MODEL)
            model_changed = (EMBEDDING_MODEL_NAME != new_embedding_model)
            EMBEDDING_MODEL_NAME = new_embedding_model

            EXTERNAL_EMBEDDING_BASE_URL = _config.get("externalEmbeddingUrl", "")
            EXTERNAL_LLM_BASE_URL = _config.get("externalLlmUrl", "")

            new_llm_model = _config.get("llmModel", DEFAULT_LLM_MODEL)
            llm_model_changed = (LLM_MODEL_NAME != new_llm_model)
            LLM_MODEL_NAME = new_llm_model

            LLM_MAX_TOKENS = int(_config.get("maxTokens", 768))
            LLM_TEMPERATURE = float(_config.get("temperature", 0.1))
            SEARCH_TOP_K = int(_config.get("topK", 5))
            SEARCH_SIMILARITY_THRESHOLD = float(_config.get("similarityThreshold", 0.3))

            MATRYOSHKA_DIMENSIONS = int(_config.get("matryoshkaDimensions", 0))
            HYBRID_SEARCH_ENABLED = _config.get("hybridSearchEnabled", False)
            RRF_K = int(_config.get("rrfK", 60))

            new_reranker_model = _config.get("rerankerModel", "BAAI/bge-reranker-base")
            new_reranking_enabled = _config.get("rerankingEnabled", False)
            reranker_changed = (RERANKER_MODEL_NAME != new_reranker_model) or (RERANKING_ENABLED != new_reranking_enabled)
            RERANKER_MODEL_NAME = new_reranker_model
            RERANKING_ENABLED = new_reranking_enabled

            OCR_ENABLED = _config.get("ocrEnabled", True)
            OCR_FALLBACK_ONLY = _config.get("ocrFallbackOnly", True)
            OCR_LANGUAGE = _config.get("ocrLanguage", "eng")

            if model_changed or EMBEDDING_PROVIDER != "local":
                _embedding_model = None  # Force reload or switch to external
                if EMBEDDING_PROVIDER == "local":
                    _start_load_thread_locked()

            if llm_model_changed and LLM_PROVIDER == "local":
                _llm_warmed_cache = None  # Invalidate cache on model change
                _start_llm_load_thread_locked()

            if reranker_changed:
                _reranker_model = None
                if RERANKING_ENABLED:
                    _start_reranker_load_thread_locked()

            return {"status": "success"}
        except Exception as e:
            logger.error("Failed to update config: %s", e)
            raise HTTPException(status_code=500, detail=str(e))


@app.post("/v1/reload")
def reload_model() -> dict[str, Any]:
    with _load_lock:
        if _loading:
            return {"triggered": False, "reason": "Load already in progress."}
        if _embedding_model is not None:
            return {"triggered": False, "reason": "Model is already loaded and ready."}
        # Clear error state and always attempt a reload
        _load_error = None
        logger.info("Manual reload triggered via API.")
        _start_load_thread_locked()
    return {"triggered": True, "reason": "Background model load started."}


@app.post("/v1/ocr")
def perform_ocr(payload: dict[str, Any]) -> dict[str, Any]:
    """Perform local Tesseract OCR on a base64 encoded image."""
    image_b64 = payload.get("image")
    lang = payload.get("lang") or OCR_LANGUAGE or "eng"
    if not image_b64:
        raise HTTPException(status_code=400, detail="Image payload is required.")

    try:
        image_data = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(image_data))
        text = pytesseract.image_to_string(image, lang=lang)
        return {"text": text}
    except Exception as exc:
        logger.error("OCR computation failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/v1/embed")
def embed_book(payload: dict[str, Any]) -> dict[str, Any]:
    """Embed a single book's text chunks and store in the database."""
    book_id = payload.get("bookId")
    user_id = payload.get("userId")
    chunks = payload.get("chunks") or []
    append = payload.get("append", False)

    if not book_id or not user_id:
        raise HTTPException(status_code=400, detail="bookId and userId are required.")
    if not chunks:
        raise HTTPException(status_code=400, detail="No chunks provided.")

    job_id = f"embed-{book_id}-{int(time.time())}"
    with _active_embed_jobs_lock:
        _active_embed_jobs[job_id] = {
            "bookId": book_id,
            "userId": user_id,
            "totalChunks": len(chunks),
            "completedChunks": 0,
            "status": "STARTED",
            "startedAt": datetime.now(timezone.utc).isoformat(),
        }

    conn = None
    cursor = None
    try:
        conn = _get_db_connection()
        cursor = conn.cursor()

        if not append:
            # Delete existing embeddings for this book
            cursor.execute("DELETE FROM book_embeddings WHERE book_id = %s AND user_id = %s", (book_id, user_id))
            conn.commit()

        # Get current chunk count for this book to continue indexing
        cursor.execute("SELECT MAX(chunk_index) FROM book_embeddings WHERE book_id = %s AND user_id = %s", (book_id, user_id))
        max_idx = cursor.fetchone()[0]
        start_idx = (max_idx + 1) if max_idx is not None else 0

        # Embed each chunk and insert
        for i, chunk in enumerate(chunks):
            chunk_text = chunk.get("text", "")
            page_number = chunk.get("pageNumber")
            chapter_title = chunk.get("chapterTitle")

            if not chunk_text.strip():
                with _active_embed_jobs_lock:
                    _active_embed_jobs[job_id]["completedChunks"] = i + 1
                continue

            vector = _compute_embedding(chunk_text)
            vector_json = json.dumps(vector)

            cursor.execute(
                """INSERT INTO book_embeddings
                   (book_id, user_id, chunk_index, chunk_text, embedding_vector, page_number, chapter_title, embedding_model)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (book_id, user_id, start_idx + i, chunk_text, vector_json, page_number, chapter_title, EMBEDDING_MODEL_NAME),
            )
            with _active_embed_jobs_lock:
                _active_embed_jobs[job_id]["completedChunks"] = i + 1

        conn.commit()

        with _active_embed_jobs_lock:
            _active_embed_jobs[job_id]["status"] = "COMPLETED"
            _active_embed_jobs[job_id]["completedAt"] = datetime.now(timezone.utc).isoformat()

        return {
            "jobId": job_id,
            "bookId": book_id,
            "status": "COMPLETED",
            "totalChunks": len(chunks),
            "completedChunks": len(chunks),
        }
    except Exception as exc:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        with _active_embed_jobs_lock:
            _active_embed_jobs[job_id]["status"] = "FAILED"
            _active_embed_jobs[job_id]["error"] = str(exc)
        logger.error("Embed job %s failed: %s", job_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass


@app.get("/v1/embed-status/{job_id}")
def embed_status(job_id: str) -> dict[str, Any]:
    with _active_embed_jobs_lock:
        job = _active_embed_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


def compute_bm25_scores(query: str, documents: list[dict], k1: float = 1.5, b: float = 0.75) -> dict[int, float]:
    # Tokenize query
    query_tokens = [w.lower() for w in re.findall(r'\w+', query) if len(w) > 1]
    if not query_tokens:
        return {}

    doc_tokens_list = []
    doc_lengths = []
    for doc in documents:
        tokens = [w.lower() for w in re.findall(r'\w+', doc["chunkText"]) if len(w) > 1]
        doc_tokens_list.append(tokens)
        doc_lengths.append(len(tokens))

    num_docs = len(documents)
    if num_docs == 0:
        return {}

    avg_doc_len = sum(doc_lengths) / num_docs

    # Document frequencies for query terms
    df = Counter()
    for tokens in doc_tokens_list:
        unique_tokens = set(tokens)
        for token in query_tokens:
            if token in unique_tokens:
                df[token] += 1

    # Compute BM25 score for each doc
    scores = {}
    for idx, doc in enumerate(documents):
        chunk_id = doc["chunkId"]
        tokens = doc_tokens_list[idx]
        tf = Counter(tokens)
        doc_len = doc_lengths[idx]

        score = 0.0
        for token in query_tokens:
            if token not in tf:
                continue
            # IDF with smoothing
            idf = math.log((num_docs - df[token] + 0.5) / (df[token] + 0.5) + 1.0)
            # Term frequency score
            freq = tf[token]
            num = freq * (k1 + 1)
            denom = freq + k1 * (1 - b + b * (doc_len / avg_doc_len))
            score += idf * (num / denom)
        if score > 0:
            scores[chunk_id] = score
    return scores


# ---- Chunk quality helpers (backported from new pipeline) ----

_TOC_MARKERS = {
    "index", "table of contents", "glossary", "appendix",
    "list of entries", "list of figures", "list of tables",
    "list of illustrations", "topical list", "references",
    "bibliography", "acknowledgments", "preface",
}
_SPACED_TOC_MARKERS = {"i n d e x", "g l o s s a r y", "t a b l e  o f  c o n t e n t s"}


def _has_toc_marker(text: str, chapter_title: str | None) -> bool:
    """Return True if the chunk text or chapter title looks like a TOC/index fragment."""
    text_lower = text.lower()
    title_lower = (chapter_title or "").lower()
    if any(marker in title_lower for marker in _TOC_MARKERS):
        return True
    if any(marker in text_lower[:200] for marker in _TOC_MARKERS):
        return True
    if any(marker in text_lower for marker in _SPACED_TOC_MARKERS):
        return True
    return False


def _looks_like_title_list(text: str) -> bool:
    """Detect long comma-separated lists of short title-like fragments.

    Index/toc chunks often contain many short phrases separated by commas
    with very few sentence terminators. A high comma-to-sentence ratio combined
    with many title-case tokens is a strong signal of a reference list.
    """
    if not text:
        return False
    sentences = [s.strip() for s in re.split(r"[.!?]", text) if s.strip()]
    if not sentences:
        return False
    commas = text.count(",")
    semicolons = text.count(";")
    punctuation_per_sentence = (commas + semicolons) / len(sentences)
    avg_sentence_len = sum(len(s) for s in sentences) / len(sentences)
    if punctuation_per_sentence >= 4 and avg_sentence_len >= 300:
        return True
    return False


def _is_heading_only(text: str) -> bool:
    """Return True if the chunk is just a heading/title or noise with no prose.

    Chunks like "Greatest Comics" or "Chapter 3: The Beginning" that contain
    only a short title phrase produce garbage in RAW mode. This filter rejects
    chunks that are:
    - Very short (< 60 chars) and have no sentence terminators (no ., !, ?)
    - Mostly title-case words (each word starts with uppercase)
    """
    if not text:
        return True
    text = text.strip()
    # Chunks shorter than 60 characters with no punctuation are always garbage/headers
    if len(text) < 60 and not re.search(r"[.!?]", text):
        return True

    # Check if the text is mostly uppercase (e.g. comic lettering) to avoid false positives on ALL CAPS prose
    letters = [c for c in text if c.isalpha()]
    if letters:
        upper_ratio = sum(1 for c in letters if c.isupper()) / len(letters)
        if upper_ratio > 0.7:
            return False

    # Original heading title-case check for longer header blocks
    if len(text) >= 60:
        # Check if most words are title-case
        words = [w for w in text.split() if len(w) >= 2 and w[0].isalpha()]
        if words:
            title_case_count = sum(1 for w in words if w[0].isupper())
            if title_case_count / len(words) >= 0.7:
                return True
        return False
    return False


def _looks_like_advertisement(text: str) -> bool:
    """Detect typical publisher catalog or subscription advertisement pages."""
    if not text:
        return False
    text_lower = text.lower()
    if "newsstand price" in text_lower or "newsstand" in text_lower:
        return True
    if "save" in text_lower and "% off" in text_lower:
        return True
    if "subscription" in text_lower or "subscribe to" in text_lower or "subscribe now" in text_lower:
        return True
    if "free sample" in text_lower or "sample issue" in text_lower:
        return True
    if "digital magazine" in text_lower or "imagine publishing" in text_lower:
        return True
    if "special offer" in text_lower and ("visit" in text_lower or "www." in text_lower):
        return True
    if "try" in text_lower and "issues for" in text_lower:
        return True
    return False


def _is_garbage_spaced_text(text: str) -> bool:
    """Detect broken OCR or spaced-out letter noise (e.g. A rt w or k)."""
    words = [w for w in re.findall(r"\b\w+\b", text) if w.isalpha()]
    if len(words) < 5:
        return False
    short_words = [w for w in words if len(w) <= 2]
    if (len(short_words) / len(words)) > 0.5:
        return True
    return False


def _is_legal_or_copyright(text: str) -> bool:
    """Detect copyright disclaimers or legal/cataloging pages."""
    text_lower = text.lower()
    if "all rights reserved" in text_lower:
        return True
    if "no part of this book" in text_lower or "no part of this publication" in text_lower:
        return True
    if "library of congress cataloging-in-publication data" in text_lower:
        return True
    return False


def _detect_intent(text: str, requested_count: int | None) -> str:
    """Classify query intent: list, summarize, or fact."""
    lowered = text.lower()
    list_indicators = ["list", "show me", "give me", "top ", "what are", "what were"]
    summarize_indicators = ["summarize", "summary", "overview", "synopsis", "explain", "describe"]
    if requested_count is not None or any(ind in lowered for ind in list_indicators):
        return "list"
    if any(ind in lowered for ind in summarize_indicators):
        return "summarize"
    return "fact"


def _text_overlap_ratio(a: str, b: str) -> float:
    """Return the Jaccard word-overlap ratio between two item texts."""
    words_a = set(re.findall(r"\b\w+\b", a.lower()))
    words_b = set(re.findall(r"\b\w+\b", b.lower()))
    if not words_a or not words_b:
        return 0.0
    return len(words_a & words_b) / len(words_a | words_b)


def _containment_ratio(a: str, b: str) -> float:
    """Return the fraction of substantive words in 'a' that are contained in 'b'."""
    stopwords = {
        "the", "a", "an", "and", "or", "but", "of", "for", "to", "in", "on", "at", 
        "by", "with", "from", "up", "about", "into", "over", "after", "is", "was",
        "are", "were", "be", "been", "being", "have", "has", "had", "do", "does",
        "did", "it", "its", "they", "them", "their", "this", "that", "these", "those"
    }
    words_a = set(w for w in re.findall(r"\b\w+\b", a.lower()) if w not in stopwords)
    words_b = set(re.findall(r"\b\w+\b", b.lower()))
    
    if not words_a:
        # If the item consists entirely of stopwords (unlikely for a real title/fact),
        # fall back to standard words including stopwords so we don't return 0.
        words_a = set(re.findall(r"\b\w+\b", a.lower()))
        if not words_a or not words_b:
            return 0.0
            
    return len(words_a & words_b) / len(words_a)


def _deduplicate_same_chunk_items(answer: str, results: list[dict]) -> str:
    """Merge consecutive list items that are near-duplicate rewordings of the same fact.

    When the LLM repeats the same fact with minor wording changes across multiple
    numbered items to satisfy a count request, this merges consecutive items whose
    text is highly similar (>= 80% word overlap) and that cite the same source.
    Distinct items that merely share a source are preserved as separate items.
    """
    if not answer or not results:
        return answer
    lines = answer.split("\n")
    if len(lines) <= 1:
        return answer

    # Build a map from source marker text to result index
    source_to_idx: dict[str, int] = {}
    for i, r in enumerate(results):
        page = r.get("pageNumber") or "N/A"
        marker = f"[Source: {r['bookTitle']}, Page {page}]"
        source_to_idx[marker] = i

    list_item_pattern = re.compile(r"^\s*(?:[-*•]|\d+\.)\s+")
    deduped: list[str] = []
    current_run: list[tuple[str, str | None]] = []  # (line_text, source_marker)

    for line in lines:
        stripped = line.strip()
        if not list_item_pattern.match(stripped):
            # Non-list line: flush any accumulated run, then pass through.
            if current_run:
                deduped.append(_merge_item_run(current_run))
                current_run = []
            deduped.append(line)
            continue

        # Extract source marker from this line
        source_match = re.search(r"\[Source:\s*([^\]]+)\]", stripped)
        source_marker = source_match.group(0) if source_match else None

        if current_run:
            last_line, last_source = current_run[-1]
            same_source = (source_marker is not None and last_source is not None
                           and source_marker == last_source)
            if same_source:
                # Compare text (strip citations for clean comparison)
                clean_last = re.sub(r"\s*\[Source:[^\]]*\]", "", last_line).strip()
                clean_curr = re.sub(r"\s*\[Source:[^\]]*\]", "", stripped).strip()
                if _text_overlap_ratio(clean_last, clean_curr) >= 0.8:
                    current_run.append((stripped, source_marker))
                    continue
            # Different source or low overlap: flush run, start new one
            deduped.append(_merge_item_run(current_run))
            current_run = []
        current_run.append((stripped, source_marker))

    if current_run:
        deduped.append(_merge_item_run(current_run))

    return "\n".join(deduped)


def _merge_item_run(run: list[tuple[str, str | None]]) -> str:
    """Merge a run of near-duplicate items into one."""
    if len(run) == 1:
        return run[0][0]
    # Keep the first item's text (it's usually the best-phrased) with its citation.
    return run[0][0]


def _strip_hallucination_lines(answer: str) -> str:
    """Remove list items that the LLM invented (hallucinated).

    Small local LLMs sometimes fabricate items to satisfy a count request,
    then add disclaimers like "inferred", "not directly sourced", or
    "not sourced in this context". These lines are removed entirely.
    """
    if not answer:
        return answer

    hallucination_patterns = [
        re.compile(r"not\s+(directly\s+)?sourced\s+in\s+this\s+context", re.IGNORECASE),
        re.compile(r"inferred\s+(based\s+on|from)", re.IGNORECASE),
        re.compile(r"not\s+directly\s+sourced", re.IGNORECASE),
    ]

    kept_lines = []
    for line in answer.split("\n"):
        stripped = line.strip()
        if not stripped:
            kept_lines.append(line)
            continue
        # Check if this line is a hallucination disclaimer
        is_hallucination = any(p.search(stripped) for p in hallucination_patterns)
        if is_hallucination:
            logger.info("Stripping hallucination line: %s", stripped[:120])
            continue
        kept_lines.append(line)

    return "\n".join(kept_lines)


def _strip_hallucinated_items(answer: str, results: list[dict]) -> str:
    """Remove list items whose content has very low word overlap with their assigned source.

    After _ensure_list_citations assigns each list item a source from results (in order),
    this function checks whether the item's substantive words actually appear in that
    source chunk. Items with < 15% Jaccard word overlap are likely LLM fabrications
    (invented titles, hallucinated facts) and are removed.

    This catches hallucinations that _strip_hallucination_lines misses because the
    LLM no longer adds "inferred" disclaimers (the system prompt forbids them).
    """
    if not answer or not results:
        return answer

    source_iter = iter(results)
    list_item_pattern = re.compile(r"^\s*(?:[-*•]|\d+\.)\s+")

    kept_lines = []
    stripped_count = 0
    for line in answer.split("\n"):
        stripped = line.strip()
        if not list_item_pattern.match(stripped):
            kept_lines.append(line)
            continue

        # Get the source assigned to this item (same order as _ensure_list_citations)
        try:
            source = next(source_iter)
        except StopIteration:
            kept_lines.append(line)
            continue

        # Extract item text without citation
        item_text = re.sub(r"\s*\[Source:[^\]]*\]", "", stripped).strip()
        source_text = source["chunkText"]

        # Compute containment ratio of item words in source
        overlap = _containment_ratio(item_text, source_text)
        if overlap < 0.15:
            logger.info(
                "Stripping hallucinated item (overlap %.2f): %s",
                overlap, stripped[:120]
            )
            stripped_count += 1
            continue

        kept_lines.append(line)

    if stripped_count > 0:
        logger.info("Stripped %d hallucinated items total", stripped_count)

    return "\n".join(kept_lines)


@app.post("/v1/search")
def search(payload: dict[str, Any]) -> dict[str, Any]:
    """Search across embedded books using a natural language query."""
    query = payload.get("query", "").strip()
    book_ids = payload.get("bookIds")  # Optional: limit to specific books
    user_id = payload.get("userId")
    top_k = int(payload.get("topK") or SEARCH_TOP_K)
    display_top_k = int(payload.get("displayTopK") or top_k)
    similarity_threshold = float(payload.get("similarityThreshold") or SEARCH_SIMILARITY_THRESHOLD)
    max_tokens = int(payload.get("maxTokens") or LLM_MAX_TOKENS)
    temperature = float(payload.get("temperature") or LLM_TEMPERATURE)
    chat_history = payload.get("chatHistory", [])
    local_only = payload.get("localOnly", False)

    hybrid_search_enabled = bool(payload.get("hybridSearchEnabled") if payload.get("hybridSearchEnabled") is not None else HYBRID_SEARCH_ENABLED)
    rrf_k = int(payload.get("rrfK") or RRF_K)
    reranking_enabled = bool(payload.get("rerankingEnabled") if payload.get("rerankingEnabled") is not None else RERANKING_ENABLED)

    if not query:
        raise HTTPException(status_code=400, detail="Query is required.")
    if not user_id:
        raise HTTPException(status_code=400, detail="userId is required.")

    # 1. Exact phrase parsing (double quotes) and token clean-up for soft boosting
    required_keywords = re.findall(r'"([^"]+)"', query)
    embedding_query = query.replace('"', '')

    # 2. Extract core keywords
    stopwords = {
        "a", "an", "the", "in", "on", "at", "to", "for", "with", "by", "of", "and", "or", "but",
        "list", "show", "find", "search", "get", "what", "how", "why", "who", "where", "me", "i",
        "you", "my", "your", "our", "their", "this", "that", "these", "those", "is", "are", "was",
        "were", "be", "been", "have", "has", "had", "do", "does", "did", "can", "could", "would",
        "should", "will", "shall", "may", "might", "must", "some", "any", "no", "all", "both",
        "each", "few", "more", "most", "other", "such", "own", "so", "than", "too", "very",
        "page", "book", "chapter", "read", "display", "result", "results",
        "provide", "information", "inform", "tell", "give", "explain", "describe", "detail",
        "details", "data", "facts", "fact", "about", "regarding", "concerning", "related", "regards",
        "looking", "look", "want", "wanted", "need", "needed", "help", "please",
        "like", "know", "say", "said", "ask", "asking", "question", "questions", "answer",
        "answers", "specifically", "specific", "particular", "certain", "exactly", "exact", "just",
        "only", "also", "even", "still", "really", "actually", "definitely", "probably", "maybe",
        "perhaps", "basically", "literally", "essentially", "generally", "usually", "often",
        "sometimes", "always", "never", "every", "many", "much", "lot", "lots", "plenty", "several",
        "various", "different", "same", "similar", "opposite", "including", "include",
        "included", "contains", "containing", "contain", "having", "make", "made",
        "summary", "summarize", "summarise", "brief", "overview", "synopsis", "recap",
        "outline", "highlight", "highlights", "tl;dr", "tldr",
        "sci-fi", "scifi", "comic", "comics", "novel", "book", "books", "literature", "vigilante",
        "funny", "humorous", "humor", "comedy", "series", "suggest", "recommend", "character",
        "characters", "author", "authors", "writer", "writers", "artist", "artists", "publisher",
        "publishers", "title", "titles", "page", "pages", "read", "reader", "readers"
    }

    def _extract_query_tokens(text: str) -> list[str]:
        compound_pattern = re.compile(r"\b\w+(?:[-']\w+)+\b")
        compounds = compound_pattern.findall(text)
        remaining = compound_pattern.sub(" ", text)
        plain = re.findall(r"\w+", remaining)
        return [w.lower() for w in compounds + plain if len(w) > 1]

    query_words = _extract_query_tokens(embedding_query)
    core_keywords = [w for w in query_words if w not in stopwords]

    # 3. Define the retrieve callback for pipeline.py
    from retrieval import retrieve as retrieve_impl
    
    def retrieve_fn(embedding_text, book_ids, user_id, top_k):
        return retrieve_impl(
            embedding_text=embedding_text,
            book_ids=book_ids,
            user_id=user_id,
            top_k=top_k,
            compute_embedding_fn=_compute_embedding,
            get_db_connection_fn=_get_db_connection,
            cosine_similarity_fn=_cosine_similarity,
            similarity_threshold=similarity_threshold,
            hybrid_search_enabled=hybrid_search_enabled,
            rrf_k=rrf_k,
            reranking_enabled=reranking_enabled,
            reranker_model=_reranker_model,
            matryoshka_dimensions=MATRYOSHKA_DIMENSIONS,
            required_phrases=required_keywords,
            semantic_keywords=core_keywords,
            is_index_request="index" in query.lower() or "table of contents" in query.lower()
        )

    # 4. Run search pipeline
    from pipeline import run_search_pipeline
    try:
        response = run_search_pipeline(
            query=query,
            book_ids=book_ids,
            user_id=user_id,
            retrieve_fn=retrieve_fn,
            generate_fn=_generate_answer,
            top_k=top_k,
            display_top_k=display_top_k,
            max_tokens=max_tokens,
            temperature=temperature,
            chat_history=chat_history,
            local_only=local_only
        )
        return response.model_dump(by_alias=True)
    except Exception as e:
        logger.error("AI Search pipeline failed: %s", e, exc_info=True)
        err_msg = str(e)
        if "dimension mismatch" in err_msg.lower():
            err_msg = f"{err_msg} Your embedding model has changed. Please re-embed your books from Settings → AI Search."
        return {
            "query": query,
            "results": [],
            "contextResults": [],
            "answer": None,
            "error": err_msg,
            "totalChunksSearched": 0,
        }


@app.get("/v1/book-embeddings/{book_id}")
def get_book_embeddings(book_id: int, user_id: int) -> dict[str, Any]:
    """Check if a book has embeddings."""
    conn = None
    cursor = None
    try:
        conn = _get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM book_embeddings WHERE book_id = %s AND user_id = %s",
            (book_id, user_id),
        )
        count = cursor.fetchone()[0]
        return {
            "bookId": book_id,
            "userId": user_id,
            "hasEmbeddings": count > 0,
            "chunkCount": count,
        }
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass


@app.post("/v1/test-embedding")
def test_embedding(payload: dict[str, Any]) -> dict[str, Any]:
    """Test embedding provider connection."""
    provider = payload.get("provider", "local")
    api_key = payload.get("apiKey", "")
    base_url = payload.get("url", "").rstrip("/")
    model = payload.get("model", "")

    if provider == "local":
        return {"success": True, "message": "Local provider selected. Tests pass by default as long as the service is running."}

    if not base_url:
        return {"success": False, "message": "External URL is required for external providers."}

    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    if provider == "openai":
        url = f"{base_url}/embeddings"
    else: # ollama
        url = f"{base_url}/api/embeddings" if "/api" not in base_url else f"{base_url}/embeddings"

    json_payload = {"model": model, "input": "test"} if provider == "openai" else {"model": model, "prompt": "test"}

    try:
        resp = requests.post(url, headers=headers, json=json_payload, timeout=10)
        resp.raise_for_status()
        return {"success": True, "message": "Connection successful! Model generated embeddings."}
    except requests.exceptions.RequestException as e:
        error_msg = str(e)
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_data = e.response.json()
                if isinstance(error_data, dict) and "error" in error_data:
                    err = error_data["error"]
                    if isinstance(err, dict) and "message" in err:
                        error_msg = f"{e.response.status_code} - {err['message']}"
                    else:
                        error_msg = f"{e.response.status_code} - {err}"
                else:
                    error_msg = f"{e.response.status_code} - {e.response.text}"
            except Exception:
                error_msg = f"{e.response.status_code} - {e.response.text}"
        return {"success": False, "message": f"Connection failed: {error_msg}"}


@app.post("/v1/test-llm")
def test_llm(payload: dict[str, Any]) -> dict[str, Any]:
    """Test LLM provider connection."""
    provider = payload.get("provider", "local")
    api_key = payload.get("apiKey", "")
    base_url = payload.get("url", "").rstrip("/")
    model = payload.get("model", "")

    if provider == "local":
        return {"success": True, "message": "Local provider selected. Tests pass by default as long as the service is running."}

    if not base_url:
        return {"success": False, "message": "External URL is required for external providers."}

    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    messages = [{"role": "user", "content": "Say 'hello' briefly."}]

    try:
        if provider == "openai":
            url = f"{base_url}/chat/completions"
            json_payload = {"model": model, "messages": messages, "max_tokens": 10}
        else: # ollama
            url = f"{base_url}/api/chat" if "/api" not in base_url else f"{base_url}/chat"
            json_payload = {"model": model, "messages": messages, "stream": False}

        resp = requests.post(url, headers=headers, json=json_payload, timeout=15)
        resp.raise_for_status()
        return {"success": True, "message": "Connection successful! Model responded."}
    except requests.exceptions.RequestException as e:
        error_msg = str(e)
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_data = e.response.json()
                if isinstance(error_data, dict) and "error" in error_data:
                    err = error_data["error"]
                    if isinstance(err, dict) and "message" in err:
                        error_msg = f"{e.response.status_code} - {err['message']}"
                    else:
                        error_msg = f"{e.response.status_code} - {err}"
                else:
                    error_msg = f"{e.response.status_code} - {e.response.text}"
            except Exception:
                error_msg = f"{e.response.status_code} - {e.response.text}"
        return {"success": False, "message": f"Connection failed: {error_msg}"}


@app.get("/v1/models/embedding")
def list_embedding_models() -> dict[str, Any]:
    models_dir = "/models"
    result = []
    if os.path.exists(models_dir):
        for entry in os.listdir(models_dir):
            if entry.startswith("models--"):
                parts = entry.split("--")
                if len(parts) >= 3:
                    namespace = parts[1]
                    name = "--".join(parts[2:])
                    path = os.path.join(models_dir, entry)
                    size = 0
                    for dirpath, dirnames, filenames in os.walk(path):
                        for f in filenames:
                            fp = os.path.join(dirpath, f)
                            if not os.path.islink(fp):
                                size += os.path.getsize(fp)
                    result.append({
                        "id": f"{namespace}/{name}",
                        "name": f"{namespace}/{name}",
                        "sizeBytes": size
                    })
    return {"models": result}


@app.delete("/v1/models/embedding/{namespace}/{model_name:path}")
def delete_embedding_model(namespace: str, model_name: str) -> dict[str, Any]:
    dir_name = f"models--{namespace}--{model_name}"
    path = os.path.join("/models", dir_name)
    if os.path.exists(path) and os.path.isdir(path):
        shutil.rmtree(path)
        return {"status": "deleted"}
    return {"status": "not_found"}


@app.get("/v1/models/llm")
def list_llm_models() -> dict[str, Any]:
    try:
        resp = requests.get("http://localhost:11434/api/tags", timeout=10)
        if resp.status_code == 200:
            data = resp.json().get("models", [])
            result = []
            for m in data:
                result.append({
                    "id": m.get("name"),
                    "name": m.get("name"),
                    "sizeBytes": m.get("size", 0)
                })
            return {"models": result}
    except Exception as exc:
        logger.error("Failed to list LLM models: %s", exc)
    return {"models": []}


@app.delete("/v1/models/llm/{model_name:path}")
def delete_llm_model(model_name: str) -> dict[str, Any]:
    try:
        resp = requests.delete("http://localhost:11434/api/delete", json={"name": model_name}, timeout=10)
        if resp.status_code == 200:
            return {"status": "deleted"}
    except Exception as exc:
        logger.error("Failed to delete LLM model: %s", exc)
    return {"status": "failed"}
