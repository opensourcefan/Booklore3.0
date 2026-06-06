import base64
import io
import json
import logging
import os
import shutil
import threading
from datetime import datetime, timezone
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from PIL import Image
from ultralytics import YOLO

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("booklore-ai-panel")

app = FastAPI()

CONFIG_PATH = "/models/config.json"
def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error("Failed to load config.json: %s", e)
    return {}

_config = load_config()
MODEL_PATH = os.getenv("MODEL_PATH", "/models/best.pt")
MODEL_SEED_PATH = os.getenv("MODEL_SEED_PATH", "/app/model-seed/best.pt")
CONF_THRESHOLD = float(_config.get("confidenceThreshold", 0.20))
IOU_THRESHOLD = float(_config.get("iouThreshold", 0.50))
MODEL_ID = _config.get("modelId", "")

_model: YOLO | None = None
_loading: bool = False
_load_error: str | None = None
_load_lock = threading.Lock()


def _seed_model_if_available() -> bool:
    if os.path.exists(MODEL_PATH):
        return True

    if not os.path.exists(MODEL_SEED_PATH):
        return False

    model_dir = os.path.dirname(MODEL_PATH)
    if model_dir:
        os.makedirs(model_dir, exist_ok=True)

    if os.path.abspath(MODEL_PATH) != os.path.abspath(MODEL_SEED_PATH):
        shutil.copy2(MODEL_SEED_PATH, MODEL_PATH)

    return os.path.exists(MODEL_PATH)


def _download_hf_model() -> str:
    from huggingface_hub import hf_hub_download
    logger.info("Downloading HF model: %s", MODEL_ID)
    try:
        hf_cache_dir = "/models/hf/hub"
        if os.path.exists(hf_cache_dir):
            target_folder = "models--" + MODEL_ID.replace("/", "--")
            for folder in os.listdir(hf_cache_dir):
                if folder.startswith("models--") and folder != target_folder:
                    folder_path = os.path.join(hf_cache_dir, folder)
                    logger.info("Removing unused HuggingFace model: %s", folder)
                    try:
                        shutil.rmtree(folder_path)
                    except Exception as e:
                        logger.error("Failed to remove unused model %s: %s", folder, e)

        return hf_hub_download(repo_id=MODEL_ID, filename='best.pt')
    except Exception as e:
        logger.error("Failed to download HF model: %s", e)
        raise e

def _do_load() -> None:
    """Background thread: loads the YOLO model and updates global state."""
    global _model, _loading, _load_error
    try:
        if MODEL_ID:
            active_model_path = _download_hf_model()
        else:
            if not _seed_model_if_available():
                raise RuntimeError(f"Model file not found at {MODEL_PATH}")
            active_model_path = MODEL_PATH

        logger.info("Model load started from %s", active_model_path)
        loaded = YOLO(active_model_path)
        _model = loaded
        logger.info("Model loaded successfully from %s", active_model_path)
    except Exception as exc:
        _load_error = str(exc)
        logger.error("Model load failed: %s", exc)
    finally:
        _loading = False


def _start_load_thread_locked() -> None:
    """Start background load thread. Caller must hold _load_lock."""
    global _loading, _load_error
    _loading = True
    _load_error = None
    threading.Thread(target=_do_load, daemon=True).start()


def _ensure_loading() -> None:
    """If a model file appeared but no load is running or previously failed, start one."""
    with _load_lock:
        if _model is not None or _loading or _load_error is not None:
            return
        if not MODEL_ID and not (os.path.exists(MODEL_PATH) or os.path.exists(MODEL_SEED_PATH)):
            return
        logger.info("Triggering automatic background load.")
        _start_load_thread_locked()


def _load_model() -> YOLO:
    """Return the loaded model or raise a descriptive RuntimeError."""
    if _model is not None:
        return _model
    if _loading:
        raise RuntimeError("Model is currently loading. Please try again shortly.")
    if _load_error:
        raise RuntimeError(
            "Model failed to load. Check server logs for details."
        )
    raise RuntimeError(
        "Model is not loaded. Place best.pt in the ai-models folder and use "
        "the Reload button, or restart the AI container."
    )


def _decode_image(b64: str) -> tuple[np.ndarray, int, int]:
    raw = base64.b64decode(b64)
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    arr = np.array(image)
    height, width = arr.shape[:2]
    return arr, width, height


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(value, high))


@app.on_event("startup")
def startup() -> None:
    if MODEL_ID:
        logger.info("HF Model ID configured; beginning background load.")
        with _load_lock:
            _start_load_thread_locked()
    else:
        model_available = os.path.exists(MODEL_PATH) or os.path.exists(MODEL_SEED_PATH)
        if model_available:
            logger.info("Model file found at startup; beginning background load.")
            with _load_lock:
                _start_load_thread_locked()
        else:
            logger.info("No model file and no MODEL_ID configured.")


@app.get("/health")
def health() -> dict[str, Any]:
    _ensure_loading()
    model_exists = os.path.exists(MODEL_PATH)
    seed_exists = os.path.exists(MODEL_SEED_PATH)
    ready = _model is not None
    if ready:
        status = "ok"
    elif _load_error is not None:
        status = "load_failed"
    elif _loading:
        status = "warming"
    elif MODEL_ID or model_exists or seed_exists:
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
        "loadError": "Model failed to load. Check server logs for details." if _load_error else None,
    }


@app.post("/v1/config")
def update_config(payload: dict[str, Any]) -> dict[str, Any]:
    global _config, CONF_THRESHOLD, IOU_THRESHOLD, MODEL_ID, _model
    
    with _load_lock:
        try:
            os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
            with open(CONFIG_PATH, "w") as f:
                json.dump(payload, f, indent=2)
            _config = payload
            CONF_THRESHOLD = float(_config.get("confidenceThreshold", 0.20))
            IOU_THRESHOLD = float(_config.get("iouThreshold", 0.50))
            
            new_model_id = _config.get("modelId", "")
            if MODEL_ID != new_model_id:
                MODEL_ID = new_model_id
                _model = None
                _start_load_thread_locked()
                
            return {"status": "success"}
        except Exception as e:
            logger.error("Failed to update config: %s", e)
            raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/reload")
def reload_model() -> dict[str, Any]:
    """Reset any previous load error and retry loading the model in the background."""
    with _load_lock:
        if _loading:
            return {"triggered": False, "reason": "Load already in progress."}
        if _model is not None:
            return {"triggered": False, "reason": "Model is already loaded and ready."}
        model_available = os.path.exists(MODEL_PATH) or os.path.exists(MODEL_SEED_PATH)
        if not model_available:
            return {"triggered": False, "reason": f"No model file found at {MODEL_PATH}."}
        logger.info("Manual reload triggered via API.")
        _start_load_thread_locked()
    return {"triggered": True, "reason": "Background model load started."}


@app.post("/v1/panel-detection/scan")
def panel_scan(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        model = _load_model()
    except Exception as ex:
        raise HTTPException(status_code=503, detail=str(ex)) from ex

    pages_in = payload.get("pages") or []
    pages_out: list[dict[str, Any]] = []

    for idx, entry in enumerate(pages_in):
        page_number = idx + 1
        image_b64 = None

        if isinstance(entry, dict):
            page_number = int(entry.get("pageNumber") or entry.get("page") or (idx + 1))
            image_b64 = entry.get("imageBase64")

        if not image_b64:
            pages_out.append({"pageNumber": page_number, "panels": []})
            continue

        try:
            image_arr, img_width, img_height = _decode_image(image_b64)
            results = model.predict(source=image_arr, conf=CONF_THRESHOLD, iou=IOU_THRESHOLD, verbose=False)
            panels: list[dict[str, Any]] = []

            if results and results[0].boxes is not None:
                for box in results[0].boxes:
                    x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]

                    x = _clamp(x1 / img_width, 0.0, 1.0)
                    y = _clamp(y1 / img_height, 0.0, 1.0)
                    width = _clamp((x2 - x1) / img_width, 0.0, 1.0)
                    height = _clamp((y2 - y1) / img_height, 0.0, 1.0)

                    if width <= 0 or height <= 0:
                        continue

                    confidence = float(box.conf.item()) if box.conf is not None else 0.0
                    panels.append(
                        {
                            "x": round(x, 6),
                            "y": round(y, 6),
                            "width": round(width, 6),
                            "height": round(height, 6),
                            "confidence": round(confidence, 6),
                        }
                    )

            pages_out.append({"pageNumber": page_number, "panels": panels})
        except Exception:
            pages_out.append({"pageNumber": page_number, "panels": []})

    return {
        "source": "hf-ultralytics-local",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "pageCount": len(pages_out),
        "pages": pages_out,
        "mock": False,
    }