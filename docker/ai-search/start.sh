#!/bin/bash
set -e

# Copy seed HF cache to persistent volume if persistent volume is empty
if [ ! -d "/models/hf" ] || [ -z "$(ls -A /models/hf)" ]; then
    echo "Initializing HuggingFace cache from seed..."
    mkdir -p /models/hf
    if [ -d "/app/model-seed/hf" ]; then
        cp -r /app/model-seed/hf/* /models/hf/ || true
    fi
fi

# Start Ollama in the background
echo "Starting Ollama service..."
ollama serve > /var/log/ollama.log 2>&1 &

# Wait for Ollama to be available
echo "Waiting for Ollama to start..."
timeout 60 bash -c 'until curl -s http://localhost:11434/api/tags > /dev/null; do sleep 1; done'

# If AUTO_CLEANUP_MODELS=true, remove old Ollama models
if [ "$AUTO_CLEANUP_MODELS" = "true" ]; then
    echo "Checking for unused Ollama models to clean up..."
    # Get all installed models except the header, extract the first column (model name)
    installed_models=$(ollama list | tail -n +2 | awk '{print $1}')
    for model in $installed_models; do
        if [ "$model" != "$LLM_MODEL" ]; then
            echo "Removing unused Ollama model: $model"
            ollama rm "$model" || true
        fi
    done
fi

# If LLM_MODEL is provided, ensure it is pulled
if [ -n "$LLM_MODEL" ]; then
    echo "Ensuring LLM model '${LLM_MODEL}' is available (this may take a few minutes if not already downloaded)..."
    ollama pull "$LLM_MODEL"
fi

# Start the FastAPI application
echo "Starting AI Search API..."
exec uvicorn app:app --host 0.0.0.0 --port 8080
