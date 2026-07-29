import os
import uuid
from datetime import datetime

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

from .service import DetectionService

router = APIRouter(prefix="/detects", tags=["detects"])

# Lazy load service
_service: DetectionService | None = None
_current_model_path: str | None = None


def _get_service_model_path() -> str:
    """Get the default model path from environment or fallback."""
    return os.environ.get("MODEL_PATH", "models/yolo26n.pt")


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
    model_path: str = Form(None)
) -> JSONResponse:
    """
    Detect office assets in uploaded image.
    
    Args:
        file: Uploaded image file
        model_path: Optional model path to use for detection.
                    If not provided, uses the default or last-used model.
        
    Returns:
        JSONResponse with detection results and annotated image URL
    """
    service = get_service(model_path)
    
    # Read image bytes
    image_bytes = await file.read()
    
    # Run detection first
    detections = service.detect(image_bytes)
    
    # Generate unique filename for detected image
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = str(uuid.uuid4())[:8]
    detected_filename = f"detected_{timestamp}_{unique_id}.jpg"
    
    # Use absolute path for uploads directory based on backend directory
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    detected_filepath = os.path.join(backend_dir, "uploads", detected_filename)
    
    # Draw bounding boxes on image
    annotated_image_bytes = service.draw_bounding_boxes(image_bytes, detections)
    
    # Save the annotated image
    os.makedirs(os.path.dirname(detected_filepath), exist_ok=True)
    with open(detected_filepath, "wb") as f:
        f.write(annotated_image_bytes)
    
    return JSONResponse({
        "image_url": f"/uploads/{detected_filename}",
        "detections": detections,
        "model_info": {
            "model_path": service.model_path if hasattr(service, 'model_path') else "unknown",
            "device": service.device
        }
    })