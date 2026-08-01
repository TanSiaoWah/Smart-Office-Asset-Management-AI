"""Router for asset detection endpoints (storage-only backend).

Detection runs entirely in the browser via ONNX Runtime Web. This backend
only stores the original and annotated images in Supabase Storage and
echoes back the detection payload sent by the client.
"""
import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from .service import DetectionPayload, get_model_bytes_io
from .storage import SupabaseStorageService

router = APIRouter(prefix="/detects", tags=["detects"])

_storage: Optional[SupabaseStorageService] = None
_model_bytes_io: Optional[object] = None


def get_storage() -> SupabaseStorageService:
    """
    Get or create the Supabase storage service singleton.

    Returns:
        SupabaseStorageService instance
    """
    global _storage
    if _storage is None:
        _storage = SupabaseStorageService()
    return _storage


def _to_https(url: str) -> str:
    """
    Normalize a storage URL to HTTPS.

    Args:
        url: Public URL returned by Supabase.

    Returns:
        HTTPS version of the URL.
    """
    if url.startswith("http://"):
        return url.replace("http://", "https://", 1)
    return url


@router.get("/model")
async def get_model() -> StreamingResponse:
    """
    Stream the YOLO ONNX model to the browser for client-side inference.

    The model is downloaded from Hugging Face using the server-side HF_TOKEN
    (which is never exposed to the browser), then streamed so that the
    browser can cache it and run detection locally with ONNX Runtime Web.

    Returns:
        StreamingResponse with the raw `best.onnx` model bytes.

    Raises:
        HTTPException: If the model cannot be downloaded (e.g. HF_TOKEN unset).
    """
    global _model_bytes_io
    try:
        if _model_bytes_io is None:
            _model_bytes_io = get_model_bytes_io()
        _model_bytes_io.seek(0)
        return StreamingResponse(
            _model_bytes_io,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": 'attachment; filename="best.onnx"',
                "Cache-Control": "public, max-age=86400",
            },
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/models")
async def list_models() -> JSONResponse:
    """
    List the available detection model for the browser.

    The actual inference happens client-side; this endpoint is kept for
    compatibility with the frontend health/connection checks.

    Returns:
        JSONResponse with a static model descriptor for best.onnx.
    """
    return JSONResponse(
        {
            "models": [
                {
                    "name": "best.onnx",
                    "path": "models/best.onnx",
                    "size": 0,
                }
            ]
        }
    )


@router.post("/detect")
async def detect_assets(
    file: UploadFile = File(...),
    annotated_file: Optional[UploadFile] = File(None),
    detections: str = Form("[]"),
    model_path: str = Form(None),
) -> JSONResponse:
    """
    Store an uploaded image and its browser-computed detection results.

    Args:
        file: Original uploaded image file.
        annotated_file: Image with bounding boxes drawn by the client (optional).
        detections: JSON string of the detection payload from the client.
        model_path: Optional model identifier (informational only).

    Returns:
        JSONResponse with stored image URLs and the detection payload.
    """
    storage = get_storage()

    # Parse the client-side detection payload.
    payload = DetectionPayload.model_validate_json(detections)
    if model_path:
        payload.model_path = model_path

    # Generate a unique base filename.
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = str(uuid.uuid4())[:8]

    # Read and store the original image.
    original_bytes = await file.read()
    original_filename = f"original_{timestamp}_{unique_id}.jpg"
    original_url = _to_https(storage.upload_image(original_bytes, original_filename))

    # Read and store the annotated image (if the client sent one).
    detected_url = None
    if annotated_file is not None:
        annotated_bytes = await annotated_file.read()
        detected_filename = f"detected_{timestamp}_{unique_id}.jpg"
        detected_url = _to_https(
            storage.upload_image(annotated_bytes, detected_filename)
        )

    return JSONResponse(
        {
            "image_url": detected_url or original_url,
            "original_image_url": original_url,
            "detections": [det.model_dump() for det in payload.detections],
            "model_info": {
                "model_path": payload.model_path,
                "model_type": payload.model_type,
                "device": payload.device or os.environ.get("DEVICE", "webgpu/wasm"),
            },
        }
    )
