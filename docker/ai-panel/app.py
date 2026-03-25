import base64
import io
import os
from datetime import datetime, timezone
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from PIL import Image
from ultralytics import YOLO

app = FastAPI()

MODEL_PATH = os.getenv("MODEL_PATH", "/models/best.pt")
CONF_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.20"))
IOU_THRESHOLD = float(os.getenv("IOU_THRESHOLD", "0.50"))

_model: YOLO | None = None


def _load_model() -> YOLO:
    global _model
    if _model is not None:
        return _model

    if not os.path.exists(MODEL_PATH):
        raise RuntimeError(f"Local model file not found at {MODEL_PATH}")

    _model = YOLO(MODEL_PATH)
    return _model


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
    try:
        _load_model()
    except Exception:
        pass


@app.get("/health")
def health() -> dict[str, Any]:
    model_exists = os.path.exists(MODEL_PATH)
    ready = _model is not None and model_exists
    return {
        "status": "ok" if ready else "warming",
        "mock": False,
        "modelPath": MODEL_PATH,
        "modelExists": model_exists,
    }


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