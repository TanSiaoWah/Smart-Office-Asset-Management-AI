"""Detection service for YOLO model inference on office assets."""
import io
import os
import glob
import logging
from typing import Dict, List, Optional, TypedDict

from PIL import Image, ImageDraw
from ultralytics import YOLO
from huggingface_hub import hf_hub_download

logger = logging.getLogger(__name__)


class DetectionResult(TypedDict):
    """Detection result structure."""
    id: int
    label: str
    confidence: float
    bbox: List[float]  # [x1, y1, x2, y2]


class DetectionService:
    """Service for running YOLO model inference on office asset images."""

    # Office asset class names from the dataset
    # Source: backend/models/dataset.yaml
    HOME_OBJECTS_CLASSES = {
        0: "Desk",
        1: "Chair",
        2: "Computer monitor",
    }

    # Cache for loaded YOLO models: model_path -> YOLO instance
    _model_cache: Dict[str, "YOLO"] = {}

    # Default Hugging Face model repository
    DEFAULT_HF_REPO = "ZiRanZ/smart-office-yolo26"
    DEFAULT_HF_FILENAME = "yolo26n.pt"

    def __init__(
        self,
        model_path: Optional[str] = None,
        device: str = "cuda",
    ) -> None:
        """
        Initialize detection service.

        The model is downloaded from Hugging Face Hub using the configured
        repository and filename. If a local model_path is provided but does
        not exist on disk, it falls back to downloading from Hugging Face.

        Args:
            model_path: Optional path to YOLO model file. If None, uses the
                        default Hugging Face model.
            device: Device to run inference on ('cuda' or 'cpu')
        """
        # Check CUDA availability
        cuda_available = self._is_cuda_available()

        # Resolve the model path (download from HF if needed)
        self.model_path = model_path or self._get_hf_model_path()
        full_path = self._resolve_model_path(self.model_path)

        # Load or retrieve from cache the specified model
        if full_path not in self._model_cache:
            self.model = YOLO(full_path)
            self._model_cache[full_path] = self.model
        else:
            self.model = self._model_cache[full_path]

        # Set device - use CUDA if available and requested, otherwise CPU
        self.device = device if cuda_available else "cpu"

        # Log initialization details
        self._log_device_info()

    def _get_hf_model_path(self) -> str:
        """
        Download the default model from Hugging Face Hub.

        Returns:
            Local path to the downloaded model file.

        Raises:
            RuntimeError: If download fails and HF_TOKEN is not set.
        """
        hf_token = os.environ.get("HF_TOKEN")
        if not hf_token:
            logger.warning(
                "HF_TOKEN not set. Attempting to download without authentication."
            )

        try:
            local_path = hf_hub_download(
                repo_id=self.DEFAULT_HF_REPO,
                filename=self.DEFAULT_HF_FILENAME,
                token=hf_token,
            )
            logger.info(
                "Downloaded model from Hugging Face: %s/%s -> %s",
                self.DEFAULT_HF_REPO,
                self.DEFAULT_HF_FILENAME,
                local_path,
            )
            return local_path
        except Exception as exc:
            raise RuntimeError(
                f"Failed to download model from Hugging Face "
                f"({self.DEFAULT_HF_REPO}/{self.DEFAULT_HF_FILENAME}): {exc}"
            ) from exc

    def _resolve_model_path(self, model_path: str) -> str:
        """
        Resolve full path for a model file.

        Priority:
        1. If the path already exists on disk, return it as-is.
        2. If the path contains 'best.pt' (the default model name), download
           from Hugging Face Hub.
        3. Check relative to backend/models/ directory.
        4. Fall back to downloading from Hugging Face Hub.

        Args:
            model_path: Relative or absolute path to the model

        Returns:
            Absolute path to the model file
        """
        # If it already exists (e.g. downloaded from HF), return directly
        if os.path.exists(model_path):
            return model_path

        # Check relative to backend directory
        if model_path.startswith("models/"):
            backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            full_path = os.path.join(backend_dir, model_path)
            if os.path.exists(full_path):
                return full_path

        # Check if it's just a filename in the models directory
        if not os.path.dirname(model_path) and not model_path.startswith(("http", "/")):
            backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            full_path = os.path.join(backend_dir, "models", model_path)
            if os.path.exists(full_path):
                return full_path

        # If the local file wasn't found, download from Hugging Face Hub
        logger.info(
            "Local model '%s' not found. Downloading from Hugging Face Hub...",
            model_path,
        )
        return self._get_hf_model_path()

    @staticmethod
    def _is_cuda_available() -> bool:
        """Check if CUDA is available."""
        try:
            import torch

            return torch.cuda.is_available()
        except ImportError:
            return False

    def _log_device_info(self) -> None:
        """Log device and model information."""
        if self.device == "cuda":
            try:
                import torch

                gpu_name = (
                    torch.cuda.get_device_name(0)
                    if torch.cuda.is_available()
                    else "Unknown"
                )
                logger.info("Using CUDA GPU: %s", gpu_name)
            except Exception:
                logger.info("Using CUDA device")
        else:
            logger.info("Using CPU for inference (CUDA not available)")

        logger.info("Model path: %s", self.model_path)

    @staticmethod
    def list_available_models() -> List[dict]:
        """
        List all available YOLO model files in the models directory.

        Returns:
            List of dicts with 'name' (filename) and 'path' (relative path) keys
        """
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        models_dir = os.path.join(backend_dir, "models")

        if not os.path.exists(models_dir):
            return []

        model_files = glob.glob(os.path.join(models_dir, "*.pt"))
        model_files.sort(key=os.path.getmtime, reverse=True)

        models = []
        for model_path in model_files:
            filename = os.path.basename(model_path)
            models.append(
                {
                    "name": filename,
                    "path": f"models/{filename}",
                    "size": os.path.getsize(model_path),
                }
            )

        return models

    def _get_class_names(self) -> dict:
        """
        Get class names from the loaded model, falling back to HomeObjects classes.

        Returns:
            dict mapping class id (int) to class name (str)
        """
        if hasattr(self.model, "names") and self.model.names:
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
        results = self.model(
            image,
            imgsz=100,
            device=self.device,
            verbose=False,
        )

        # Get class names from the loaded model (supports custom models)
        class_names = self._get_class_names()

        detections = []
        for i, result in enumerate(results[0].boxes):
            class_id = int(result.cls[0])
            confidence = float(result.conf[0])
            bbox = result.xyxy[0].tolist()  # [x1, y1, x2, y2]

            label = class_names.get(class_id, f"class_{class_id}")

            detections.append(
                DetectionResult(
                    id=i,
                    label=label,
                    confidence=confidence,
                    bbox=[
                        float(bbox[0]),
                        float(bbox[1]),
                        float(bbox[2]),
                        float(bbox[3]),
                    ],
                )
            )

        return detections

    def draw_bounding_boxes(
        self, image_bytes: bytes, detections: List[DetectionResult]
    ) -> bytes:
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
            label_width = len(detection["label"]) * 8 + 10
            draw.rectangle([x1, y1 - 25, x1 + label_width, y1], fill=color)

            # Draw label text
            draw.text((x1 + 5, y1 - 23), detection["label"], fill="white")

        # Convert back to bytes
        output = io.BytesIO()
        image.save(output, format="JPEG")
        return output.getvalue()