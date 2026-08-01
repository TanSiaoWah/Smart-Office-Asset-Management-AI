"""Detection service for YOLO model inference on office assets."""
import io
import os
import glob
import logging
from typing import Dict, List, Optional, TypedDict

import numpy as np
import cv2
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


class YOLOONNXInference:
    """YOLO inference using ONNX Runtime (no PyTorch dependency)."""

    # Office asset class names matching the training config
    HOME_OBJECTS_CLASSES = {
        0: "Desk",
        1: "Chair",
        2: "Computer monitor",
    }

    def __init__(
        self,
        onnx_path: str,
        img_size: int = 640,
        conf_thres: float = 0.25,
        iou_thres: float = 0.45,
    ) -> None:
        """
        Initialize ONNX Runtime YOLO inference.

        Args:
            onnx_path: Path to the ONNX model file.
            img_size: Input image size (assumed square).
            conf_thres: Confidence threshold for filtering detections.
            iou_thres: IoU threshold for NMS.
        """
        import onnxruntime as ort

        self.img_size = img_size
        self.conf_thres = conf_thres
        self.iou_thres = iou_thres

        # Create ONNX Runtime session
        providers = (
            ["CUDAExecutionProvider", "CPUExecutionProvider"]
            if ort.get_device() == "GPU"
            else ["CPUExecutionProvider"]
        )
        self.session = ort.InferenceSession(onnx_path, providers=providers)

        # Get model input/output details
        self.input_name = self.session.get_inputs()[0].name
        self.input_shape = self.session.get_inputs()[0].shape

        # Determine output format from output shape
        # Ultralytics end-to-end ONNX output shape: (1, max_detections, 6)
        # Each row: [x1, y1, x2, y2, confidence, class_id] (NMS already applied)
        output_shape = self.session.get_outputs()[0].shape
        self.max_detections = output_shape[1]
        self.output_channels = output_shape[2]

        logger.info("ONNX model loaded: %s", onnx_path)
        logger.info("  Input shape: %s", self.input_shape)
        logger.info("  Output shape: %s", output_shape)
        logger.info("  Max detections: %d", self.max_detections)
        logger.info("  Output channels: %d", self.output_channels)
        logger.info("  Providers: %s", providers)

    def preprocess(self, image: np.ndarray) -> tuple:
        """
        Preprocess image for YOLO ONNX inference (Ultralytics letterbox).

        Args:
            image: Input image as BGR numpy array (H, W, C).

        Returns:
            Tuple of (tensor, scale, (pad_top, pad_left)):
                tensor: Preprocessed image tensor (1, 3, img_size, img_size).
                scale: Scale factor applied to the original image.
                pad: (pad_top, pad_left) padding added during letterboxing.
        """
        h, w = image.shape[:2]
        scale = min(self.img_size / h, self.img_size / w)
        new_h, new_w = int(round(h * scale)), int(round(w * scale))
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        # Symmetric letterbox padding (matches Ultralytics preprocessing)
        pad_h = self.img_size - new_h
        pad_w = self.img_size - new_w
        pad_top = pad_h // 2
        pad_bottom = pad_h - pad_top
        pad_left = pad_w // 2
        pad_right = pad_w - pad_left

        canvas = np.full((self.img_size, self.img_size, 3), 114, dtype=np.uint8)
        canvas[pad_top:pad_top + new_h, pad_left:pad_left + new_w] = resized

        # Convert BGR to RGB, normalize, and add batch dimension
        rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        tensor = np.transpose(rgb, (2, 0, 1))  # HWC -> CHW
        tensor = np.expand_dims(tensor, axis=0)  # CHW -> NCHW

        return tensor.astype(np.float32), scale, (pad_top, pad_left)

    def postprocess(
        self, outputs: np.ndarray, orig_shape: tuple, scale: float, pad: tuple
    ) -> list:
        """
        Postprocess YOLO ONNX output to extract detections.

        The ONNX output from Ultralytics end-to-end YOLO has shape
        (1, max_detections, 6). Each row is [x1, y1, x2, y2, confidence, class_id]
        in pixels relative to img_size, with NMS already applied inside the graph.

        Args:
            outputs: Raw model output (1, max_detections, 6).
            orig_shape: Original image shape (H, W).
            scale: Scale factor used during preprocessing.
            pad: Padding (top, left) used during preprocessing.

        Returns:
            List of detections: [{'class_id': int, 'confidence': float, 'bbox': [x1,y1,x2,y2]}].
        """
        # Output format: (1, max_detections, 6) -> [x1, y1, x2, y2, conf, class_id]
        detections_arr = outputs[0]  # (max_detections, 6)

        # Filter out empty detections (confidence == 0) and below threshold
        confidences = detections_arr[:, 4]
        valid_mask = confidences >= self.conf_thres
        if not np.any(valid_mask):
            return []

        valid = detections_arr[valid_mask]

        # Extract bbox (x1, y1, x2, y2) in pixels relative to img_size
        x1 = valid[:, 0]
        y1 = valid[:, 1]
        x2 = valid[:, 2]
        y2 = valid[:, 3]
        scores = valid[:, 4]
        class_ids = valid[:, 5].astype(int)

        # Remove letterbox padding and scale to original image
        pad_top, pad_left = pad
        x1 = (x1 - pad_left) / scale
        y1 = (y1 - pad_top) / scale
        x2 = (x2 - pad_left) / scale
        y2 = (y2 - pad_top) / scale

        # Clip to image boundaries
        orig_h, orig_w = orig_shape
        x1 = np.clip(x1, 0, orig_w)
        y1 = np.clip(y1, 0, orig_h)
        x2 = np.clip(x2, 0, orig_w)
        y2 = np.clip(y2, 0, orig_h)

        # Build detections (NMS already applied inside the ONNX graph)
        detections = []
        for i in range(len(scores)):
            detections.append(
                {
                    "class_id": int(class_ids[i]),
                    "confidence": float(scores[i]),
                    "bbox": [
                        float(x1[i]),
                        float(y1[i]),
                        float(x2[i]),
                        float(y2[i]),
                    ],
                }
            )

        return detections

    def detect(self, image_bytes: bytes) -> List[dict]:
        """
        Run YOLO ONNX inference on image bytes.

        Args:
            image_bytes: Raw image bytes.

        Returns:
            List of detections with class_id, confidence, and bbox.
        """
        # Read image from bytes
        np_arr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Could not decode image from bytes")

        orig_h, orig_w = image.shape[:2]

        # Preprocess (returns tensor, scale, and letterbox padding)
        input_tensor, scale, pad = self.preprocess(image)

        # Run inference
        outputs = self.session.run(None, {self.input_name: input_tensor})[0]

        # Postprocess
        detections = self.postprocess(outputs, (orig_h, orig_w), scale, pad)

        return detections

    def get_class_names(self) -> dict:
        """
        Get class names for this model.

        Returns:
            dict mapping class id (int) to class name (str)
        """
        return self.HOME_OBJECTS_CLASSES


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

    # Cache for loaded ONNX models: model_path -> YOLOONNXInference instance
    _onnx_model_cache: Dict[str, YOLOONNXInference] = {}

    # Default Hugging Face model repository
    DEFAULT_HF_REPO = "ZiRanZ/smart-office-yolo26"
    DEFAULT_HF_FILENAME = "best.onnx"

    def __init__(
        self,
        model_path: Optional[str] = None,
        device: str = "cuda",
    ) -> None:
        """
        Initialize detection service.

        Supports both PyTorch (.pt) and ONNX (.onnx) model formats.
        If a .onnx file is provided, inference runs via ONNX Runtime
        without any PyTorch dependency. If a .pt file is provided,
        inference runs via Ultralytics YOLO (PyTorch).

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

        # Detect model type from file extension
        self.model_type = self._detect_model_type(full_path)

        if self.model_type == "onnx":
            # Load ONNX model via ONNX Runtime
            if full_path not in self._onnx_model_cache:
                self.onnx_model = YOLOONNXInference(
                    onnx_path=full_path,
                    img_size=640,
                    conf_thres=0.25,
                    iou_thres=0.45,
                )
                self._onnx_model_cache[full_path] = self.onnx_model
            else:
                self.onnx_model = self._onnx_model_cache[full_path]
            self.model = None  # No PyTorch model loaded
        else:
            # Load or retrieve from cache the specified PyTorch model
            if full_path not in self._model_cache:
                self.model = YOLO(full_path)
                self._model_cache[full_path] = self.model
            else:
                self.model = self._model_cache[full_path]
            self.onnx_model = None  # No ONNX model loaded

        # Set device - use CUDA if available and requested, otherwise CPU
        self.device = device if cuda_available else "cpu"

        # Log initialization details
        self._log_device_info()

    @staticmethod
    def _detect_model_type(full_path: str) -> str:
        """
        Detect whether the model is ONNX or PyTorch based on file extension.

        Args:
            full_path: Absolute path to the model file.

        Returns:
            'onnx' if the file ends with .onnx, 'pytorch' otherwise.
        """
        if full_path.lower().endswith(".onnx"):
            return "onnx"
        return "pytorch"

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
        logger.info("Model type: %s", self.model_type)

    @staticmethod
    def list_available_models() -> List[dict]:
        """
        List all available YOLO model files in the models directory.

        Supports both .pt (PyTorch) and .onnx (ONNX) formats.

        Returns:
            List of dicts with 'name' (filename) and 'path' (relative path) keys
        """
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        models_dir = os.path.join(backend_dir, "models")

        if not os.path.exists(models_dir):
            return []

        # Collect both .pt and .onnx model files
        model_files = glob.glob(os.path.join(models_dir, "*.pt")) + glob.glob(
            os.path.join(models_dir, "*.onnx")
        )
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
        if self.model_type == "onnx" and self.onnx_model is not None:
            return self.onnx_model.get_class_names()
        if hasattr(self.model, "names") and self.model.names:
            return {int(k): v for k, v in self.model.names.items()}
        return self.HOME_OBJECTS_CLASSES

    def detect(self, image_bytes: bytes) -> List[DetectionResult]:
        """
        Detect office assets in image using YOLO model.

        Automatically uses ONNX Runtime if the loaded model is in .onnx format,
        otherwise uses Ultralytics YOLO (PyTorch).

        Args:
            image_bytes: Raw image bytes

        Returns:
            List of detection results with id, label, confidence, and bounding box
        """
        if self.model_type == "onnx":
            return self._detect_onnx(image_bytes)
        return self._detect_pytorch(image_bytes)

    def _detect_onnx(self, image_bytes: bytes) -> List[DetectionResult]:
        """
        Detect office assets using ONNX Runtime inference.

        Args:
            image_bytes: Raw image bytes

        Returns:
            List of detection results with id, label, confidence, and bounding box
        """
        # Run ONNX inference
        raw_detections = self.onnx_model.detect(image_bytes)

        # Get class names
        class_names = self._get_class_names()

        detections = []
        for i, det in enumerate(raw_detections):
            class_id = det["class_id"]
            confidence = det["confidence"]
            bbox = det["bbox"]  # [x1, y1, x2, y2]

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

    def _detect_pytorch(self, image_bytes: bytes) -> List[DetectionResult]:
        """
        Detect office assets using Ultralytics YOLO (PyTorch) inference.

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
            imgsz=640,
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