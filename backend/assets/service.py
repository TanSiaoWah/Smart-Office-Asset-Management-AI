"""Detection service for YOLO model inference on office assets."""
import io
import os
from typing import List, TypedDict

from PIL import Image, ImageDraw
from ultralytics import YOLO


class DetectionResult(TypedDict):
    """Detection result structure."""
    id: int
    label: str
    confidence: float
    bbox: List[float]  # [x1, y1, x2, y2]


class DetectionService:
    """Service for running YOLO model inference on office asset images."""
    
    # Office asset class names from HomeObjects-3K dataset (12 classes)
    # Source: backend/models/HomeObjects-3K.yaml
    HOME_OBJECTS_CLASSES = {
        0: "bed",
        1: "sofa",
        2: "chair",
        3: "table",
        4: "lamp",
        5: "tv",
        6: "laptop",
        7: "wardrobe",
        8: "window",
        9: "door",
        10: "potted plant",
        11: "photo frame"
    }
    
    def __init__(self, model_path: str = "models/best.pt", device: str = "cuda") -> None:
        """
        Initialize detection service.
        
        Args:
            model_path: Path to YOLO model file (e.g., 'models/yolo26n.pt', 'yolov8n.pt')
            device: Device to run inference on ('cuda' or 'cpu')
        """
        # Check CUDA availability
        cuda_available = self._is_cuda_available()
        
        self.model_path = model_path
        
        # Resolve full path for custom models
        if model_path.startswith("models/"):
            backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            full_path = os.path.join(backend_dir, model_path)
            if os.path.exists(full_path):
                model_path = full_path
        
        # Load the specified model
        self.model = YOLO(model_path)
        
        # Set device - use CUDA if available and requested, otherwise CPU
        self.device = device if cuda_available else "cpu"
        
        # Log initialization details
        self._log_device_info()
    
    def _is_cuda_available(self) -> bool:
        """Check if CUDA is available."""
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            return False
    
    def _log_device_info(self) -> None:
        """Log device and model information."""
        import logging
        logger = logging.getLogger(__name__)
        
        if self.device == "cuda":
            try:
                import torch
                gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "Unknown"
                logger.info(f"Using CUDA GPU: {gpu_name}")
            except Exception:
                logger.info("Using CUDA device")
        else:
            logger.info("Using CPU for inference (CUDA not available)")
        
        logger.info(f"Model path: {self.model.model_path if hasattr(self.model, 'model_path') else 'unknown'}")
    
    def _get_class_names(self) -> dict:
        """
        Get class names from the loaded model, falling back to HomeObjects classes.
        
        Returns:
            dict mapping class id (int) to class name (str)
        """
        if hasattr(self.model, 'names') and self.model.names:
            return {int(k): v for k, v in self.model.names.items()}
        return self.HOME_OBJECTS_CLASSES

    def detect(self, image_bytes: bytes) -> List[DetectionResult]:
        """
        Detect office assets in image using YOLO model.
        
        Args:
            image_bytes: Raw image bytes
            
        Returns:
            List of detection results with id, label, confidence, and bounding box
        """
        # Convert bytes to PIL Image
        image = Image.open(io.BytesIO(image_bytes))
        
        # Run YOLO prediction with CUDA device
        results = self.model(image, device=self.device)
        
        # Get class names from the loaded model (supports custom models)
        class_names = self._get_class_names()
        
        detections = []
        for i, result in enumerate(results[0].boxes):
            class_id = int(result.cls[0])
            confidence = float(result.conf[0])
            bbox = result.xyxy[0].tolist()  # [x1, y1, x2, y2]
            
            label = class_names.get(class_id, f"class_{class_id}")
            
            detections.append(DetectionResult(
                id=i,
                label=label,
                confidence=confidence,
                bbox=[float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])]
            ))
        
        return detections
    
    def draw_bounding_boxes(self, image_bytes: bytes, detections: List[DetectionResult]) -> bytes:
        """
        Draw bounding boxes on image for detected items.
        
        Args:
            image_bytes: Raw image bytes
            detections: List of detection results
            
        Returns:
            Image bytes with bounding boxes drawn
        """
        image = Image.open(io.BytesIO(image_bytes))
        draw = ImageDraw.Draw(image)
        
        # Colors for bounding boxes (purple shades to match theme)
        colors = ["#a855f7", "#9333ea", "#7e22ce", "#6b21a8"]
        
        for i, detection in enumerate(detections):
            x1, y1, x2, y2 = detection["bbox"]
            color = colors[i % len(colors)]
            
            # Draw bounding box
            draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
            
            # Draw label background
            label_width = len(detection['label']) * 8 + 10
            draw.rectangle([x1, y1 - 25, x1 + label_width, y1], fill=color)
            
            # Draw label text
            draw.text((x1 + 5, y1 - 23), detection['label'], fill="white")
        
        # Convert back to bytes
        output = io.BytesIO()
        image.save(output, format="JPEG")
        return output.getvalue()