"""Detection service for YOLO model inference."""
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
    """Service for running YOLO model inference on images."""
    
    # Common food class names for YOLO models (COCO classes)
    FOOD_CLASSES = {
        47: "apple", 48: "orange", 49: "broccoli", 50: "carrot", 51: "hot dog",
        52: "pizza", 53: "donut", 54: "cake", 55: "chair", 56: "couch",
        57: "potted plant", 58: "bed", 59: "dining table", 60: "toilet",
        61: "tv", 62: "laptop", 63: "mouse", 64: "remote", 65: "keyboard",
        66: "cell phone", 67: "microwave", 68: "oven", 69: "toaster",
        70: "sink", 71: "refrigerator", 72: "book", 73: "clock", 74: "vase",
        75: "scissors", 76: "teddy bear", 77: "hair drier", 78: "toothbrush"
    }
    
    def __init__(self, model_path: str = "models/yolo26n.pt") -> None:
        """
        Initialize detection service.
        
        Args:
            model_path: Path to YOLO model file
        """
        # Resolve model path
        if os.path.isabs(model_path) and os.path.exists(model_path):
            self.model = YOLO(model_path)
        else:
            # Get the backend directory (where this file is located)
            backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            
            # Try relative path from backend directory
            full_model_path = os.path.join(backend_dir, model_path)
            if os.path.exists(full_model_path):
                self.model = YOLO(full_model_path)
            else:
                # Try to find model in models subdirectory
                models_model_path = os.path.join(backend_dir, "models", "yolo26n.pt")
                if os.path.exists(models_model_path):
                    self.model = YOLO(models_model_path)
                else:
                    # Use default YOLO model
                    self.model = YOLO("yolov8n.pt")
    
    def detect(self, image_bytes: bytes) -> List[DetectionResult]:
        """
        Detect food items in image using YOLO model.
        
        Args:
            image_bytes: Raw image bytes
            
        Returns:
            List of detection results with id, label, confidence, and bounding box
        """
        # Convert bytes to PIL Image
        image = Image.open(io.BytesIO(image_bytes))
        
        # Run YOLO prediction
        results = self.model(image)
        
        detections = []
        for i, result in enumerate(results[0].boxes):
            class_id = int(result.cls[0])
            confidence = float(result.conf[0])
            bbox = result.xyxy[0].tolist()  # [x1, y1, x2, y2]
            
            label = self.FOOD_CLASSES.get(class_id, f"class_{class_id}")
            
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
