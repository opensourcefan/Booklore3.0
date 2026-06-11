import json
import logging
import math
import os
import re
import requests
import shutil
import threading
import time
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
    try:
        if AUTO_CLEANUP_MODELS:
            hf_cache_dir = "/models/hf/hub"
            if os.path.exists(hf_cache_dir):
                target_folder = "models--" + EMBEDDING_MODEL_NAME.replace("/", "--")
                for folder in os.listdir(hf_cache_dir):
                    if folder.startswith("models--") and folder != target_folder:
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
        logger.info("LLM model pulled successfully: %s", LLM_MODEL_NAME)
    except Exception as exc:
        _llm_load_error = str(exc)
        logger.error("LLM model pull failed: %s", exc)
    finally:
        _llm_loading = False


def _start_llm_load_thread_locked() -> None:
    global _llm_loading, _llm_load_error
    _llm_loading = True
    _llm_load_error = None
    threading.Thread(target=_do_llm_load, daemon=True).start()


def _do_reranker_load() -> None:
    """Background thread: loads the reranker model."""
    global _reranker_model, _reranker_loading, _reranker_load_error

    if not RERANKING_ENABLED or not RERANKER_MODEL_NAME:
        _reranker_loading = False
        return

    logger.info("Reranker model load started for %s", RERANKER_MODEL_NAME)
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


def _generate_answer(query: str, context: str, max_tokens: int, temperature: float, chat_history: list[dict] = None) -> str:
    """Generate an answer using the LLM (local Ollama or external)."""
    if not LLM_MODEL_NAME and LLM_PROVIDER == "local":
        raise RuntimeError("No LLM model configured.")

    headers = {}
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"

    system_prompt = (
        "You are an AI search assistant. Read the provided Context carefully.\n"
        "Your task is to respond to the user's Query based ONLY on the Context.\n"
        "If the Query is a question, answer it.\n"
        "If the Query is a command (e.g., 'summarize', 'show me'), follow it.\n"
        "If the Query is just keywords, summarize what the Context says about them.\n"
        "You MUST cite your sources using the exact format [Source: Book Title, Page N].\n"
        "If the context contains no relevant information at all, reply EXACTLY with: 'I could not find any relevant information for this search.' and nothing else.\n"
        "\n"
        "RESPONSE LENGTH: Adjust your answer's depth to match the user's request:\n"
        "- If the user asks for 'detail', 'in depth', 'thorough', 'elaborate', or 'explain fully': "
        "provide a comprehensive, multi-paragraph answer covering all relevant aspects from the Context.\n"
        "- If the user asks for a 'summary', 'brief', 'short', 'concise', or 'tl;dr': "
        "provide a compact 1-3 sentence answer.\n"
        "- For neutral queries with no length cue: provide a balanced, moderate-length answer."
    )

    user_prompt = f"Context:\n{context}\n\nQuery: {query}"

    messages = [{"role": "system", "content": system_prompt}]
    if chat_history:
        messages.extend(chat_history)
    messages.append({"role": "user", "content": user_prompt})

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
            timeout=300,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    else:
        if LLM_PROVIDER == "local":
            base_url = "http://localhost:11434"
        else:
            base_url = EXTERNAL_LLM_BASE_URL.rstrip("/") or "http://localhost:11434"
        url = f"{base_url}/api/chat" if "/api" not in base_url else f"{base_url}/chat"
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
                },
            },
            timeout=300,
        )
        resp.raise_for_status()
        return resp.json().get("message", {}).get("content", "")


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

    return {
        "status": status,
        "mock": False,
        "embeddingModel": EMBEDDING_MODEL_NAME,
        "loadError": error,
        "provider": EMBEDDING_PROVIDER
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
        cursor.close()
        conn.close()

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
        with _active_embed_jobs_lock:
            _active_embed_jobs[job_id]["status"] = "FAILED"
            _active_embed_jobs[job_id]["error"] = str(exc)
        logger.error("Embed job %s failed: %s", job_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/v1/embed-status/{job_id}")
def embed_status(job_id: str) -> dict[str, Any]:
    with _active_embed_jobs_lock:
        job = _active_embed_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


def compute_bm25_scores(query: str, documents: list[dict], k1: float = 1.5, b: float = 0.75) -> dict[int, float]:
    from collections import Counter
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


@app.post("/v1/search")
def search(payload: dict[str, Any]) -> dict[str, Any]:
    """Search across embedded books using a natural language query."""
    query = payload.get("query", "").strip()
    book_ids = payload.get("bookIds")  # Optional: limit to specific books
    user_id = payload.get("userId")
    top_k = int(payload.get("topK") or SEARCH_TOP_K)
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

    try:
        # Compute query embedding
        query_vector = _compute_embedding(query)
    except RuntimeError as e:
        logger.error("Embedding computation failed: %s", e)
        return {
            "query": query,
            "results": [],
            "answer": None,
            "error": str(e),
            "totalChunksSearched": 0,
        }

    # Fetch embeddings from DB (single connection reused for adjacent chunks)
    conn = _get_db_connection()
    cursor = conn.cursor(dictionary=True)

    if book_ids and len(book_ids) > 0:
        placeholders = ",".join(["%s"] * len(book_ids))
        cursor.execute(
            f"""SELECT be.id, be.book_id, be.user_id, be.chunk_index, be.chunk_text,
                       be.embedding_vector, be.page_number, be.chapter_title,
                       b.title as book_title
                FROM book_embeddings be
                JOIN book_metadata b ON b.book_id = be.book_id
                WHERE be.user_id = %s AND be.book_id IN ({placeholders})""",
            [user_id] + list(book_ids),
        )
    else:
        cursor.execute(
            """SELECT be.id, be.book_id, be.user_id, be.chunk_index, be.chunk_text,
                      be.embedding_vector, be.page_number, be.chapter_title,
                      b.title as book_title
               FROM book_embeddings be
               JOIN book_metadata b ON b.book_id = be.book_id
               WHERE be.user_id = %s""",
            (user_id,),
        )

    rows = cursor.fetchall()

    if not rows:
        cursor.close()
        conn.close()
        return {
            "query": query,
            "results": [],
            "answer": "No books have been embedded yet. Use the AI Search settings to embed books first.",
            "totalChunksSearched": 0,
        }

    is_index_request = "index" in query.lower() or "table of contents" in query.lower()

    # Early dimension-mismatch detection: compare query vector length to first stored embedding
    query_dim = len(query_vector)
    first_vector = None
    for row in rows:
        try:
            first_vector = json.loads(row["embedding_vector"])
            break
        except (json.JSONDecodeError, TypeError, ValueError):
            continue

    if first_vector is not None and len(first_vector) != query_dim:
        stored_dim = len(first_vector)
        logger.error(
            "Embedding dimension mismatch: query vector is %d-d but stored embeddings are %d-d. "
            "The embedding model has changed since these books were embedded. "
            "Re-embed your books to fix this.",
            query_dim, stored_dim,
        )
        cursor.close()
        conn.close()
        return {
            "query": query,
            "results": [],
            "answer": None,
            "error": f"Embedding dimension mismatch: the active model produces {query_dim}-d vectors "
                     f"but your stored embeddings are {stored_dim}-d. "
                     f"Your embedding model has changed. Please re-embed your books from Settings → AI Search.",
            "totalChunksSearched": len(rows),
        }

    # Map database rows into structured documents, applying heuristic filtering
    documents = []
    row_map = {}
    for row in rows:
        if not is_index_request:
            ch_title = (row["chapter_title"] or "").lower()
            text_prefix = row["chunk_text"][:200].lower()
            if "index" in ch_title or "table of contents" in ch_title or "glossary" in ch_title:
                continue
            if "i n d e x" in text_prefix or "g l o s s a r y" in text_prefix:
                continue
            words = text_prefix.split()
            numbers = [w for w in words if re.match(r'^\d+$', w)]
            if len(words) > 0 and (len(numbers) / len(words)) > 0.15:
                continue

        doc = {
            "chunkId": row["id"],
            "bookId": row["book_id"],
            "bookTitle": row["book_title"],
            "chunkIndex": row["chunk_index"],
            "chunkText": row["chunk_text"],
            "pageNumber": row["page_number"],
            "chapterTitle": row["chapter_title"],
        }
        documents.append(doc)
        row_map[row["id"]] = row

    # Compute dense vector similarities
    scored_vector = []
    for doc in documents:
        try:
            row = row_map[doc["chunkId"]]
            vector = json.loads(row["embedding_vector"])
            # Slice/re-normalize vector if MRL truncation is enabled in search
            if MATRYOSHKA_DIMENSIONS > 0 and len(vector) > MATRYOSHKA_DIMENSIONS:
                vector = vector[:MATRYOSHKA_DIMENSIONS]
                norm = np.linalg.norm(vector)
                if norm > 0:
                    vector = (vector / norm).tolist()

            similarity = _cosine_similarity(query_vector, vector)
            if similarity >= similarity_threshold:
                doc_copy = doc.copy()
                doc_copy["similarity"] = round(similarity, 4)
                scored_vector.append(doc_copy)
        except Exception:
            continue

    scored_vector.sort(key=lambda x: x["similarity"], reverse=True)

    candidates = []
    if hybrid_search_enabled:
        # Compute BM25 scores
        bm25_scores = compute_bm25_scores(query, documents)
        scored_bm25 = []
        for doc in documents:
            score = bm25_scores.get(doc["chunkId"], 0.0)
            if score > 0:
                doc_copy = doc.copy()
                doc_copy["bm25_score"] = score
                scored_bm25.append(doc_copy)
        scored_bm25.sort(key=lambda x: x["bm25_score"], reverse=True)

        # Merge using Reciprocal Rank Fusion (RRF)
        vector_ranks = {d["chunkId"]: r for r, d in enumerate(scored_vector)}
        bm25_ranks = {d["chunkId"]: r for r, d in enumerate(scored_bm25)}
        all_candidate_chunk_ids = set(vector_ranks.keys()) | set(bm25_ranks.keys())

        chunk_id_to_doc = {doc["chunkId"]: doc for doc in documents}
        rrf_results = []
        for chunk_id in all_candidate_chunk_ids:
            score_vector = 1.0 / (rrf_k + vector_ranks[chunk_id]) if chunk_id in vector_ranks else 0.0
            score_bm25 = 1.0 / (rrf_k + bm25_ranks[chunk_id]) if chunk_id in bm25_ranks else 0.0
            rrf_score = score_vector + score_bm25

            doc_copy = chunk_id_to_doc[chunk_id].copy()
            doc_copy["rrf_score"] = round(rrf_score, 6)
            # Use RRF score as a surrogate for sorting, but preserve the original vector similarity if available
            doc_copy["similarity"] = scored_vector[vector_ranks[chunk_id]]["similarity"] if chunk_id in vector_ranks else round(rrf_score, 4)
            rrf_results.append(doc_copy)

        rrf_results.sort(key=lambda x: x["rrf_score"], reverse=True)
        candidates = rrf_results
    else:
        candidates = scored_vector

    # Apply Cross-Encoder Reranking if enabled and loaded
    if reranking_enabled and _reranker_model is not None:
        # Rerank the top candidates (up to 20 candidates for CPU efficiency)
        rerank_pool_size = max(20, top_k * 2)
        candidates_to_rerank = candidates[:rerank_pool_size]
        if candidates_to_rerank:
            pairs = [[query, c["chunkText"]] for c in candidates_to_rerank]
            try:
                scores = _reranker_model.predict(pairs)
                if hasattr(scores, "tolist"):
                    scores = scores.tolist()
                if isinstance(scores, float):
                    scores = [scores]
                for idx, score in enumerate(scores):
                    candidates_to_rerank[idx]["rerank_score"] = round(float(score), 4)
                
                # Sort by reranker score
                candidates_to_rerank.sort(key=lambda x: x["rerank_score"], reverse=True)
                candidates = candidates_to_rerank + candidates[rerank_pool_size:]
            except Exception as e:
                logger.error("Failed to run reranker: %s", e)

    top_results = candidates[:top_k]

    # Fetch adjacent chunks for each top result using the SAME connection
    if top_results:
        for r in top_results:
            book_id_val = r["bookId"]
            chunk_idx = r["chunkIndex"]
            # Fetch previous chunk (contextBefore)
            cursor.execute(
                """SELECT chunk_text FROM book_embeddings
                   WHERE book_id = %s AND user_id = %s AND chunk_index = %s""",
                (book_id_val, user_id, chunk_idx - 1),
            )
            prev_row = cursor.fetchone()
            r["contextBefore"] = prev_row["chunk_text"] if prev_row else None
            # Fetch next chunk (contextAfter)
            cursor.execute(
                """SELECT chunk_text FROM book_embeddings
                   WHERE book_id = %s AND user_id = %s AND chunk_index = %s""",
                (book_id_val, user_id, chunk_idx + 1),
            )
            next_row = cursor.fetchone()
            r["contextAfter"] = next_row["chunk_text"] if next_row else None

    cursor.close()
    conn.close()

    # Generate answer using LLM if available and not local-only mode
    answer = None
    if top_results and not local_only:
        context = "\n\n".join([
            f"[Source: {r['bookTitle']}, Page {r.get('pageNumber') or 'N/A'}]\n{r['chunkText']}"
            for r in top_results
        ])
        try:
            answer = _generate_answer(query, context, max_tokens, temperature, chat_history)
        except Exception as e:
            logger.error("Error generating LLM answer: %s", e)
            answer = None

    # If the LLM returned the "not found" sentinel but we DO have results,
    # suppress the misleading answer so the frontend shows the raw matches.
    if answer and "I could not find any relevant information" in answer and top_results:
        logger.info(
            "LLM returned 'not found' sentinel despite %d results. "
            "Suppressing answer so frontend displays raw matches.",
            len(top_results),
        )
        answer = None

    return {
        "query": query,
        "results": top_results,
        "answer": answer,
        "totalChunksSearched": len(rows),
    }


@app.get("/v1/book-embeddings/{book_id}")
def get_book_embeddings(book_id: int, user_id: int) -> dict[str, Any]:
    """Check if a book has embeddings."""
    conn = _get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) FROM book_embeddings WHERE book_id = %s AND user_id = %s",
        (book_id, user_id),
    )
    count = cursor.fetchone()[0]
    cursor.close()
    conn.close()

    return {
        "bookId": book_id,
        "userId": user_id,
        "hasEmbeddings": count > 0,
        "chunkCount": count,
    }


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
