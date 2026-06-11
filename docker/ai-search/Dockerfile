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
    tesseract-ocr \
    libtesseract-dev \
    tesseract-ocr-eng \
    && curl -fsSL https://ollama.com/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

ENV OLLAMA_MODELS=/models/ollama

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

# Bake the embedding model into the image as a seed file.
# On first container start, start.sh copies it to the
# mounted volume (/models/hf) so it persists across recreates.
RUN mkdir -p /app/model-seed/hf && \
    HF_HOME=/app/model-seed/hf python -c \
      "from sentence_transformers import SentenceTransformer; \
       SentenceTransformer('${EMBEDDING_MODEL_ID}')"

COPY app.py /app/app.py
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8080 11434

CMD ["/app/start.sh"]
