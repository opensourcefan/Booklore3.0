# AI Search Configuration

Fable's AI Semantic Search can be highly customized to suit your hardware and preferences. 

The `fable-ai-search` service reads several environment variables to control its behavior. You can set these in your `.env` file to override the default settings.

## Model Selection

> **WARNING**: If you change your `AI_SEARCH_EMBEDDING_MODEL`, any previously generated book embeddings will become mathematically incompatible with the new model and search will fail. Fable will display an orange warning badge on books with mismatched embeddings. You will need to re-click **Embed for AI Search** to regenerate them for the new model.

You can override the default models (which are lightweight and CPU-friendly) to use larger, more accurate ones if you have the hardware for it.

```ini
# Embedding Model (Default: BAAI/bge-small-en-v1.5)
AI_SEARCH_EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
AI_SEARCH_EMBEDDING_DIMENSIONS=384

# LLM Model for Search Synthesis (Default: qwen2.5:1.5b)
AI_SEARCH_LLM_MODEL=qwen2.5:1.5b
```

## External AI Providers (Ollama, OpenAI, etc.)

Instead of downloading and running models locally inside the container, you can point Fable's AI Search to an external, OpenAI-compatible API (like a local Ollama instance or a remote cloud provider).

```ini
# External LLM Base URL (e.g., http://host.docker.internal:11434/v1)
AI_SEARCH_EXTERNAL_LLM_URL=

# External Embedding Base URL
AI_SEARCH_EXTERNAL_EMBEDDING_URL=
```

## Search & Performance Tuning

Fine-tune how search results are ranked and generated.

```ini
# Number of top results to return and synthesize (Default: 5)
AI_SEARCH_TOP_K=5

# Minimum cosine similarity score to consider a match (Default: 0.3)
AI_SEARCH_SIMILARITY_THRESHOLD=0.3

# Maximum tokens for the LLM to generate (Default: 768)
AI_SEARCH_LLM_MAX_TOKENS=768

# Temperature for the LLM generation (Default: 0.1 for factual synthesis)
AI_SEARCH_LLM_TEMPERATURE=0.1
```

## Optional Shared Secret (Java ↔ AI Search sidecar)

By default the AI Search container trusts the Docker network (optional install). To lock down `/v1/*` endpoints, set the **same** value on both the Fable API and the AI Search service:

```ini
AI_SEARCH_SHARED_SECRET=change-me-to-a-long-random-string
```

- Java sends header `X-Fable-Ai-Search-Secret` on all AI Search HTTP calls when the value is non-blank.
- Python rejects `/v1/*` requests with `401` when the secret is set and the header is missing/wrong.
- `/health` stays open for container probes and the Settings status panel.
- Leave blank (default) for home installs that do not need the extra lock.
