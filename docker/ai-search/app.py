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
EMBEDDING_MODEL_NAME = _config.get("embeddingModel", "BAAI/bge-base-en-v1.5")
EXTERNAL_EMBEDDING_BASE_URL = _config.get("externalEmbeddingUrl", "")

LLM_PROVIDER = _config.get("llmProvider", "local")
LLM_API_KEY = _config.get("llmApiKey", "")
EXTERNAL_LLM_BASE_URL = _config.get("externalLlmUrl", "")
LLM_MODEL_NAME = _config.get("llmModel", "qwen2.5:1.5b")
LLM_MAX_TOKENS = int(_config.get("maxTokens", 768))
LLM_TEMPERATURE = float(_config.get("temperature", 0.1))
SEARCH_TOP_K = int(_config.get("topK", 5))
SEARCH_SIMILARITY_THRESHOLD = float(_config.get("similarityThreshold", 0.3))

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


def _do_load() -> None:
    """Background thread: loads the embedding model."""
    global _embedding_model, _loading, _load_error

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

        _embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
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


def _ensure_loading() -> None:
    if not EMBEDDING_MODEL_NAME and EMBEDDING_PROVIDER == "local":
        return
    with _load_lock:
        if _embedding_model is not None or _loading or _load_error is not None:
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
    if EMBEDDING_PROVIDER == "openai" or EMBEDDING_PROVIDER == "ollama":
        import requests
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
            return resp.json()["embedding"]
        else:
            return resp.json()["data"][0]["embedding"]

    model = _get_embedding_model()
    return model.encode(text, normalize_embeddings=True).tolist()


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors (already normalized)."""
    return float(np.dot(a, b))


def _generate_answer(query: str, context: str, max_tokens: int, temperature: float, chat_history: list[dict] = None) -> str:
    """Generate an answer using the LLM (local Ollama or external)."""
    if not LLM_MODEL_NAME and LLM_PROVIDER == "local":
        raise RuntimeError("No LLM model configured.")

    import requests

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
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
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
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json().get("message", {}).get("content", "")


# ---- API Endpoints ----

@app.on_event("startup")
def startup() -> None:
    if EMBEDDING_PROVIDER != "local":
        logger.info("Using external provider %s for Embeddings", EMBEDDING_PROVIDER)
    elif EMBEDDING_MODEL_NAME:
        logger.info("Beginning background load for local embedding model: %s", EMBEDDING_MODEL_NAME)
        with _load_lock:
            _start_load_thread_locked()
    else:
        logger.info("No external or local embedding model configured.")


@app.get("/health")
def health() -> dict[str, Any]:
    _ensure_loading()
    # Check if the model has successfully finished loading into memory
    ready = _embedding_model is not None

    if EMBEDDING_PROVIDER != "local":
        status = "ok" 
    elif ready:
        status = "ok"
    elif _load_error is not None:
        status = "load_failed"
    elif _loading:
        status = "warming"
    else:
        status = "warming"

    return {
        "status": status,
        "mock": False,
        "embeddingModel": EMBEDDING_MODEL_NAME,
        "loadError": _load_error,
        "provider": EMBEDDING_PROVIDER
    }

@app.post("/v1/config")
def update_config(payload: dict[str, Any]) -> dict[str, Any]:
    global _config, EMBEDDING_PROVIDER, EMBEDDING_API_KEY, LLM_PROVIDER, LLM_API_KEY, EMBEDDING_MODEL_NAME, EXTERNAL_EMBEDDING_BASE_URL, EXTERNAL_LLM_BASE_URL, LLM_MODEL_NAME, LLM_MAX_TOKENS, LLM_TEMPERATURE, SEARCH_TOP_K, SEARCH_SIMILARITY_THRESHOLD, _embedding_model
    
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
            
            new_embedding_model = _config.get("embeddingModel", "all-MiniLM-L6-v2")
            model_changed = (EMBEDDING_MODEL_NAME != new_embedding_model)
            EMBEDDING_MODEL_NAME = new_embedding_model
            
            EXTERNAL_EMBEDDING_BASE_URL = _config.get("externalEmbeddingUrl", "")
            EXTERNAL_LLM_BASE_URL = _config.get("externalLlmUrl", "")
            LLM_MODEL_NAME = _config.get("llmModel", "llama3.2")
            LLM_MAX_TOKENS = int(_config.get("maxTokens", 768))
            LLM_TEMPERATURE = float(_config.get("temperature", 0.1))
            SEARCH_TOP_K = int(_config.get("topK", 5))
            SEARCH_SIMILARITY_THRESHOLD = float(_config.get("similarityThreshold", 0.3))
            
            if model_changed or EMBEDDING_PROVIDER != "local":
                _embedding_model = None  # Force reload or switch to external
                if EMBEDDING_PROVIDER == "local":
                    _start_load_thread_locked()
                    
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
    append = payload.get("append", False)

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
                _active_embed_jobs[job_id]["completedChunks"] = i + 1
                continue

            vector = _compute_embedding(chunk_text)
            vector_json = json.dumps(vector)

            cursor.execute(
                """INSERT INTO book_embeddings
                   (book_id, user_id, chunk_index, chunk_text, embedding_vector, page_number, chapter_title)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (book_id, user_id, start_idx + i, chunk_text, vector_json, page_number, chapter_title),
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
    top_k = int(payload.get("topK") or SEARCH_TOP_K)
    similarity_threshold = float(payload.get("similarityThreshold") or SEARCH_SIMILARITY_THRESHOLD)
    max_tokens = int(payload.get("maxTokens") or LLM_MAX_TOKENS)
    temperature = float(payload.get("temperature") or LLM_TEMPERATURE)
    chat_history = payload.get("chatHistory", [])
    local_only = payload.get("localOnly", False)

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
        return {
            "query": query,
            "results": [],
            "answer": None,
            "error": f"Embedding dimension mismatch: the active model produces {query_dim}-d vectors "
                     f"but your stored embeddings are {stored_dim}-d. "
                     f"Your embedding model has changed. Please re-embed your books from Settings → AI Search.",
            "totalChunksSearched": len(rows),
        }

    # Compute similarities
    scored: list[dict[str, Any]] = []
    for row in rows:
        # Heuristic: skip likely index pages if not requested
        if not is_index_request:
            ch_title = (row["chapter_title"] or "").lower()
            text_prefix = row["chunk_text"][:200].lower()
            if "index" in ch_title or "table of contents" in ch_title or "glossary" in ch_title:
                continue
            if "i n d e x" in text_prefix or "g l o s s a r y" in text_prefix:
                continue
            # Also skip if it seems to be just a huge list of numbers and words (typical of index/TOC pages)
            import re
            words = text_prefix.split()
            numbers = [w for w in words if re.match(r'^\d+$', w)]
            if len(words) > 0 and (len(numbers) / len(words)) > 0.15:
                continue
        try:
            vector = json.loads(row["embedding_vector"])
            similarity = _cosine_similarity(query_vector, vector)
            if similarity >= similarity_threshold:
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
        except (json.JSONDecodeError, TypeError, ValueError):
            continue

    # Sort by similarity descending, take top K
    scored.sort(key=lambda x: x["similarity"], reverse=True)
    top_results = scored[:top_k]

    # Fetch adjacent chunks for each top result to provide fuller context in the detail view
    if top_results:
        conn = _get_db_connection()
        cursor = conn.cursor(dictionary=True)
        for r in top_results:
            book_id = r["bookId"]
            chunk_idx = r["chunkIndex"]
            # Fetch previous chunk (contextBefore)
            cursor.execute(
                """SELECT chunk_text FROM book_embeddings
                   WHERE book_id = %s AND user_id = %s AND chunk_index = %s""",
                (book_id, user_id, chunk_idx - 1),
            )
            prev_row = cursor.fetchone()
            r["contextBefore"] = prev_row["chunk_text"] if prev_row else None
            # Fetch next chunk (contextAfter)
            cursor.execute(
                """SELECT chunk_text FROM book_embeddings
                   WHERE book_id = %s AND user_id = %s AND chunk_index = %s""",
                (book_id, user_id, chunk_idx + 1),
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
        
    import requests
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
        
    import requests
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
