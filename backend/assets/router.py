import os
import uuid
from datetime import datetime

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse

from .service import DetectionService

router = APIRouter(prefix="/detects", tags=["detects"])

# Lazy load service
_service: DetectionService | None = None

def get_service() -> DetectionService:
    """Get or create detection service instance."""
    global _service
    if _service is None:
        model_path = os.environ.get("MODEL_PATH", "models/yolo26n.pt")
        device = os.environ.get("DEVICE", "cuda")
        _service = DetectionService(model_path=model_path, device=device)
    return _service


@router.post("/detect")
async def detect_assets(file: UploadFile = File(...)) -> JSONResponse:
    """
    Detect office assets in uploaded image.
    
    Args:
        file: Uploaded image file
        
    Returns:
        JSONResponse with detection results and annotated image URL
    """
    service = get_service()
    
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
