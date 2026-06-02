FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models/hf \
    SENTENCE_TRANSFORMERS_HOME=/models

ARG EMBEDDING_MODEL_ID=BAAI/bge-small-en-v1.5

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    curl \
    zstd \
    && curl -fsSL https://ollama.com/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

ENV OLLAMA_MODELS=/models/ollama

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

# Bake the embedding model into the image as a seed file.
# On first container start, _seed_model_if_available() copies it to the
# mounted volume (/models) so it persists across recreates.
RUN pip install huggingface_hub && \
    mkdir -p /app/model-seed/embedding && \
    HF_HOME=/tmp/hf-build python -c \
      "from huggingface_hub import snapshot_download; \
       snapshot_download(repo_id='${EMBEDDING_MODEL_ID}', local_dir='/app/model-seed/embedding')" && \
    rm -rf /tmp/hf-build

COPY app.py /app/app.py
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8080 11434

CMD ["/app/start.sh"]
