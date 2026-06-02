#!/bin/bash
set -e

# Start Ollama in the background
echo "Starting Ollama service..."
ollama serve > /var/log/ollama.log 2>&1 &

# Wait for Ollama to be available
echo "Waiting for Ollama to start..."
timeout 60 bash -c 'until curl -s http://localhost:11434/api/tags > /dev/null; do sleep 1; done'

# If LLM_MODEL is provided, ensure it is pulled
if [ -n "$LLM_MODEL" ]; then
    echo "Ensuring LLM model '${LLM_MODEL}' is available (this may take a few minutes if not already downloaded)..."
    ollama pull "$LLM_MODEL"
fi

# Start the FastAPI application
echo "Starting AI Search API..."
exec uvicorn app:app --host 0.0.0.0 --port 8080
