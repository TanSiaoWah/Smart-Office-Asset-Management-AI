"""Router for asset detection endpoints with Supabase storage."""
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

from .service import DetectionService
from .storage import SupabaseStorageService

router = APIRouter(prefix="/detects", tags=["detects"])

# Lazy load service
_service: DetectionService | None = None
_current_model_path: str | None = None
_storage: SupabaseStorageService | None = None


def _get_service_model_path() -> str:
    """
    Get the default model path from environment or fallback.

    If MODEL_PATH is not set, defaults to 'best.pt' which triggers
    the Hugging Face download in DetectionService.
    """
    return os.environ.get("MODEL_PATH", "best.pt")


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


def get_service(model_path: str | None = None) -> DetectionService:
    """
    Get or create detection service instance.

    If a model_path is provided that differs from the current service's model,
    a new service will be created for that model.

    Args:
        model_path: Optional path to YOLO model file

    Returns:
        DetectionService instance
    """
    global _service, _current_model_path

    target_path = model_path or _get_service_model_path()

    if _service is None or _current_model_path != target_path:
        device = os.environ.get("DEVICE", "cuda")
        _service = DetectionService(model_path=target_path, device=device)
        _current_model_path = target_path

    return _service


@router.get("/models")
async def list_models() -> JSONResponse:
    """
    List all available YOLO models in the models directory.

    Returns:
        JSONResponse with list of available models
    """
    models = DetectionService.list_available_models()
    return JSONResponse({"models": models})


@router.post("/detect")
async def detect_assets(
    file: UploadFile = File(...),
    model_path: str = Form(None),
) -> JSONResponse:
    """
    Detect office assets in uploaded image.

    The original uploaded image and the annotated result are both stored in the
    Supabase bucket configured via environment variables (SUPABASE_BUCKET_NAME).

    Args:
        file: Uploaded image file
        model_path: Optional model path to use for detection.
                    If not provided, uses the default or last-used model.

    Returns:
        JSONResponse with detection results and annotated image URL
    """
    service = get_service(model_path)
    storage = get_storage()

    # Read image bytes
    image_bytes = await file.read()

    # Generate unique base filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = str(uuid.uuid4())[:8]

    # Upload the original image to Supabase
    original_filename = f"original_{timestamp}_{unique_id}.jpg"
    original_url = storage.upload_image(image_bytes, original_filename)
    if original_url.startswith("http"):
        original_url = original_url.replace("http://", "https://", 1)

    # Run detection
    detections = service.detect(image_bytes)

    # Draw bounding boxes on image
    detected_filename = f"detected_{timestamp}_{unique_id}.jpg"
    annotated_image_bytes = service.draw_bounding_boxes(image_bytes, detections)

    # Upload the annotated image to Supabase
    detected_url = storage.upload_image(annotated_image_bytes, detected_filename)
    if detected_url.startswith("http"):
        detected_url = detected_url.replace("http://", "https://", 1)

    return JSONResponse({
        "image_url": detected_url,
        "original_image_url": original_url,
        "detections": detections,
        "model_info": {
            "model_path": service.model_path if hasattr(service, "model_path") else "unknown",
            "model_type": service.model_type if hasattr(service, "model_type") else "pytorch",
            "device": service.device,
        },
    })
