import json
import logging
import os
import shutil
import threading
import time
from datetime import datetime, timezone
from typing import Any

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

# ---- Configuration ----
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
EMBEDDING_DIMENSIONS = int(os.getenv("EMBEDDING_DIMENSIONS", "384"))
MODEL_PATH = os.getenv("MODEL_PATH", "/models/embedding")
MODEL_SEED_PATH = os.getenv("MODEL_SEED_PATH", "/app/model-seed/embedding")
EXTERNAL_LLM_BASE_URL = os.getenv("EXTERNAL_LLM_BASE_URL", "")
EXTERNAL_EMBEDDING_BASE_URL = os.getenv("EXTERNAL_EMBEDDING_BASE_URL", "")
LLM_MODEL_NAME = os.getenv("LLM_MODEL", "qwen2.5:1.5b")
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "512"))
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.1"))
SEARCH_TOP_K = int(os.getenv("SEARCH_TOP_K", "3"))
SEARCH_SIMILARITY_THRESHOLD = float(os.getenv("SEARCH_SIMILARITY_THRESHOLD", "0.3"))

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
_load_lock = threading.Lock()
_active_embed_jobs: dict[str, dict[str, Any]] = {}


def _seed_model_if_available() -> bool:
    """Copy baked-in model from image to persistent volume on first start."""
    if os.path.exists(MODEL_PATH) and os.listdir(MODEL_PATH):
        return True

    if not os.path.exists(MODEL_SEED_PATH):
        return False

    model_dir = os.path.dirname(MODEL_PATH)
    if model_dir:
        os.makedirs(model_dir, exist_ok=True)

    if os.path.abspath(MODEL_PATH) != os.path.abspath(MODEL_SEED_PATH):
        if os.path.exists(MODEL_PATH):
            shutil.rmtree(MODEL_PATH)
        shutil.copytree(MODEL_SEED_PATH, MODEL_PATH)

    return os.path.exists(MODEL_PATH) and bool(os.listdir(MODEL_PATH))


def _do_load() -> None:
    """Background thread: loads the embedding model."""
    global _embedding_model, _loading, _load_error
    logger.info("Embedding model load started from %s", MODEL_PATH)
    try:
        if not _seed_model_if_available():
            raise RuntimeError(f"Model not found at {MODEL_PATH}")
        _embedding_model = SentenceTransformer(MODEL_PATH)
        logger.info("Embedding model loaded successfully from %s", MODEL_PATH)
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


def _ensure_loading() -> None:
    with _load_lock:
        if _embedding_model is not None or _loading or _load_error is not None:
            return
        if not (os.path.exists(MODEL_PATH) or os.path.exists(MODEL_SEED_PATH)):
            return
        logger.info("Model file detected; triggering automatic background load.")
        _start_load_thread_locked()


def _get_embedding_model() -> SentenceTransformer:
    if _embedding_model is not None:
        return _embedding_model
    if _loading:
        raise RuntimeError("Embedding model is currently loading. Please try again shortly.")
    if _load_error:
        raise RuntimeError("Embedding model failed to load. Check server logs for details.")
    raise RuntimeError("Embedding model is not loaded.")


def _get_db_connection():
    import mysql.connector
    return mysql.connector.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USERNAME,
        password=DB_PASSWORD,
        charset="utf8mb4",
    )


def _compute_embedding(text: str) -> list[float]:
    """Compute embedding vector for a text string."""
    if EXTERNAL_EMBEDDING_BASE_URL:
        import requests
        resp = requests.post(
            f"{EXTERNAL_EMBEDDING_BASE_URL}/embeddings",
            json={"model": "text-embedding-ada-002", "input": text},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]

    model = _get_embedding_model()
    return model.encode(text, normalize_embeddings=True).tolist()


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors (already normalized)."""
    return float(np.dot(a, b))


def _generate_answer(prompt: str) -> str:
    """Generate an answer using the LLM (local Ollama or external)."""
    import requests

    if EXTERNAL_LLM_BASE_URL:
        base_url = EXTERNAL_LLM_BASE_URL.rstrip("/")
    else:
        base_url = "http://localhost:11434"

    resp = requests.post(
        f"{base_url}/api/generate",
        json={
            "model": LLM_MODEL_NAME,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": LLM_MAX_TOKENS,
                "temperature": LLM_TEMPERATURE,
            },
        },
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json().get("response", "")


# ---- API Endpoints ----

@app.on_event("startup")
def startup() -> None:
    model_available = os.path.exists(MODEL_PATH) or os.path.exists(MODEL_SEED_PATH)
    if model_available:
        logger.info("Model file found at startup; beginning background load.")
        with _load_lock:
            _start_load_thread_locked()
    else:
        logger.info(
            "No model at %s and no seed at %s. Model will be loaded when available.",
            MODEL_PATH,
            MODEL_SEED_PATH,
        )


@app.get("/health")
def health() -> dict[str, Any]:
    _ensure_loading()
    model_exists = os.path.exists(MODEL_PATH) and bool(os.listdir(MODEL_PATH))
    seed_exists = os.path.exists(MODEL_SEED_PATH) and bool(os.listdir(MODEL_SEED_PATH))
    ready = _embedding_model is not None and model_exists

    if ready:
        status = "ok"
    elif _load_error is not None:
        status = "load_failed"
    elif _loading:
        status = "warming"
    elif model_exists or seed_exists:
        status = "warming"
    else:
        status = "missing_model"

    return {
        "status": status,
        "mock": False,
        "modelPath": MODEL_PATH,
        "modelExists": model_exists,
        "seedPath": MODEL_SEED_PATH,
        "seedExists": seed_exists,
        "loadError": _load_error,
        "externalLlmConfigured": bool(EXTERNAL_LLM_BASE_URL),
        "externalEmbeddingConfigured": bool(EXTERNAL_EMBEDDING_BASE_URL),
    }


@app.post("/v1/reload")
def reload_model() -> dict[str, Any]:
    with _load_lock:
        if _loading:
            return {"triggered": False, "reason": "Load already in progress."}
        if _embedding_model is not None:
            return {"triggered": False, "reason": "Model is already loaded and ready."}
        model_available = os.path.exists(MODEL_PATH) or os.path.exists(MODEL_SEED_PATH)
        if not model_available:
            return {"triggered": False, "reason": f"No model found at {MODEL_PATH}."}
        logger.info("Manual reload triggered via API.")
        _start_load_thread_locked()
    return {"triggered": True, "reason": "Background model load started."}


@app.post("/v1/embed")
def embed_book(payload: dict[str, Any]) -> dict[str, Any]:
    """Embed a single book's text chunks and store in the database."""
    book_id = payload.get("bookId")
    user_id = payload.get("userId")
    chunks = payload.get("chunks") or []

    if not book_id or not user_id:
        raise HTTPException(status_code=400, detail="bookId and userId are required.")
    if not chunks:
        raise HTTPException(status_code=400, detail="No chunks provided.")

    job_id = f"embed-{book_id}-{int(time.time())}"
    _active_embed_jobs[job_id] = {
        "bookId": book_id,
        "userId": user_id,
        "totalChunks": len(chunks),
        "completedChunks": 0,
        "status": "STARTED",
        "startedAt": datetime.now(timezone.utc).isoformat(),
    }

    try:
        # Delete existing embeddings for this book
        conn = _get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM book_embeddings WHERE book_id = %s AND user_id = %s", (book_id, user_id))
        conn.commit()

        # Embed each chunk and insert
        for i, chunk in enumerate(chunks):
            chunk_text = chunk.get("text", "")
            page_number = chunk.get("pageNumber")
            chapter_title = chunk.get("chapterTitle")

            if not chunk_text.strip():
                _active_embed_jobs[job_id]["completedChunks"] = i + 1
                continue

            vector = _compute_embedding(chunk_text)
            vector_json = json.dumps(vector)

            cursor.execute(
                """INSERT INTO book_embeddings
                   (book_id, user_id, chunk_index, chunk_text, embedding_vector, page_number, chapter_title)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (book_id, user_id, i, chunk_text, vector_json, page_number, chapter_title),
            )
            _active_embed_jobs[job_id]["completedChunks"] = i + 1

        conn.commit()
        cursor.close()
        conn.close()

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
        _active_embed_jobs[job_id]["status"] = "FAILED"
        _active_embed_jobs[job_id]["error"] = str(exc)
        logger.error("Embed job %s failed: %s", job_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/v1/embed-status/{job_id}")
def embed_status(job_id: str) -> dict[str, Any]:
    job = _active_embed_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@app.post("/v1/search")
def search(payload: dict[str, Any]) -> dict[str, Any]:
    """Search across embedded books using a natural language query."""
    query = payload.get("query", "").strip()
    book_ids = payload.get("bookIds")  # Optional: limit to specific books
    user_id = payload.get("userId")

    if not query:
        raise HTTPException(status_code=400, detail="Query is required.")
    if not user_id:
        raise HTTPException(status_code=400, detail="userId is required.")

    # Compute query embedding
    query_vector = _compute_embedding(query)

    # Fetch embeddings from DB
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
    cursor.close()
    conn.close()

    if not rows:
        return {
            "query": query,
            "results": [],
            "answer": "No books have been embedded yet. Use the AI Search settings to embed books first.",
            "totalChunksSearched": 0,
        }

    # Compute similarities
    scored: list[dict[str, Any]] = []
    for row in rows:
        try:
            vector = json.loads(row["embedding_vector"])
            similarity = _cosine_similarity(query_vector, vector)
            if similarity >= SEARCH_SIMILARITY_THRESHOLD:
                scored.append({
                    "chunkId": row["id"],
                    "bookId": row["book_id"],
                    "bookTitle": row["book_title"],
                    "chunkIndex": row["chunk_index"],
                    "chunkText": row["chunk_text"],
                    "pageNumber": row["page_number"],
                    "chapterTitle": row["chapter_title"],
                    "similarity": round(similarity, 4),
                })
        except (json.JSONDecodeError, TypeError):
            continue

    # Sort by similarity descending, take top K
    scored.sort(key=lambda x: x["similarity"], reverse=True)
    top_results = scored[:SEARCH_TOP_K]

    # Generate answer using LLM if available
    answer = None
    if top_results:
        context = "\n\n".join([
            f"[Source: {r['bookTitle']}, Page {r.get('pageNumber') or 'N/A'}]\n{r['chunkText']}"
            for r in top_results
        ])
        prompt = (
            f"Based on the following excerpts from books, answer the question.\n\n"
            f"Context:\n{context}\n\n"
            f"Question: {query}\n\n"
            f"Answer:"
        )
        try:
            answer = _generate_answer(prompt)
        except Exception as exc:
            logger.warning("LLM generation failed: %s", exc)
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
