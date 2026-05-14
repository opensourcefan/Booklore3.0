FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models/hf \
    YOLO_CONFIG_DIR=/tmp/ultralytics

ARG MODEL_ID=mosesb/best-comic-panel-detection

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

# Bake the model into the image as a seed file.
# On first container start, _seed_model_if_available() copies it to the
# mounted volume (/models/best.pt) so it persists across recreates.
# huggingface_hub is installed here (build-time only) then the HF cache is cleaned up.
RUN pip install huggingface_hub && \
    mkdir -p /app/model-seed && \
    HF_HOME=/tmp/hf-build python -c \
      "from huggingface_hub import hf_hub_download; \
       hf_hub_download(repo_id='${MODEL_ID}', filename='best.pt', local_dir='/app/model-seed')" && \
    rm -rf /tmp/hf-build

COPY app.py /app/app.py

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]