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
    
    # Default class names for YOLO models (can be overridden with custom model)
    # Source: backend/models/coco.yaml
    COCO_CLASSES = {
        0: "person", 1: "bicycle", 2: "car", 3: "motorcycle", 4: "airplane",
        5: "bus", 6: "train", 7: "truck", 8: "boat", 9: "traffic light",
        10: "fire hydrant", 11: "stop sign", 12: "parking meter", 13: "bench", 14: "bird",
        15: "cat", 16: "dog", 17: "horse", 18: "sheep", 19: "cow",
        20: "elephant", 21: "bear", 22: "zebra", 23: "giraffe", 24: "backpack",
        25: "umbrella", 26: "handbag", 27: "tie", 28: "suitcase", 29: "frisbee",
        30: "skis", 31: "snowboard", 32: "sports ball", 33: "kite", 34: "baseball bat",
        35: "baseball glove", 36: "skateboard", 37: "surfboard", 38: "tennis racket", 39: "bottle",
        40: "wine glass", 41: "cup", 42: "fork", 43: "knife", 44: "spoon",
        45: "bowl", 46: "banana", 47: "apple", 48: "sandwich", 49: "orange",
        50: "broccoli", 51: "carrot", 52: "hot dog", 53: "pizza", 54: "donut",
        55: "cake", 56: "chair", 57: "couch", 58: "potted plant", 59: "bed",
        60: "dining table", 61: "toilet", 62: "tv", 63: "laptop", 64: "mouse",
        65: "remote", 66: "keyboard", 67: "cell phone", 68: "microwave", 69: "oven",
        70: "toaster", 71: "sink", 72: "refrigerator", 73: "book", 74: "clock",
        75: "vase", 76: "scissors", 77: "teddy bear", 78: "hair drier", 79: "toothbrush"
    }
    
    def __init__(self, model_path: str = "models/yolo26n.pt", device: str = "cuda") -> None:
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
        Get class names from the loaded model, falling back to COCO classes.
        
        Returns:
            dict mapping class id (int) to class name (str)
        """
        if hasattr(self.model, 'names') and self.model.names:
            return {int(k): v for k, v in self.model.names.items()}
        return self.COCO_CLASSES

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