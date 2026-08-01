"""Schemas and helpers for the storage-only detection backend.

Inference runs in the browser via ONNX Runtime Web. The backend only:
  1. Streams the (possibly Hugging Face-gated) `best.onnx` model to the
     browser through an authenticated proxy endpoint, and
  2. Stores original/annotated images and detection payloads in Supabase.
"""
import io
import os
from typing import List, Optional

from huggingface_hub import hf_hub_download
from pydantic import BaseModel, Field


class DetectionResult(BaseModel):
    """A single detected asset returned by the browser-side ONNX inference."""

    id: int = Field(..., description="Zero-based index of the detection.")
    label: str = Field(..., description="Human-readable class name, e.g. 'Chair'.")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score in [0, 1].")
    bbox: List[float] = Field(
        ...,
        min_length=4,
        max_length=4,
        description="Bounding box as [x1, y1, x2, y2] in pixel coordinates.",
    )


class DetectionPayload(BaseModel):
    """Body payload for a single browser-side detection scan."""

    detections: List[DetectionResult] = Field(
        default_factory=list,
        description="List of assets detected in the uploaded image.",
    )
    model_path: Optional[str] = Field(
        default="best.onnx",
        description="Model identifier used by the client (informational only).",
    )
    model_type: str = Field(
        default="onnx-web",
        description="Runtime used for inference on the client ('onnx-web').",
    )
    device: str = Field(
        default="webgpu/wasm",
        description="Execution provider used by ONNX Runtime Web.",
    )


# Default Hugging Face model repository (same as the original backend).
DEFAULT_HF_REPO = "ZiRanZ/smart-office-yolo26"
DEFAULT_HF_FILENAME = "best.onnx"


def _get_hf_token() -> Optional[str]:
    """
    Read the Hugging Face token from the environment.

    Returns:
        The HF token, or None if it is not configured.
    """
    return os.environ.get("HF_TOKEN")


def get_model_bytes() -> bytes:
    """
    Download the model from Hugging Face (server-side, using HF_TOKEN).

    The token stays secret — it is never exposed to the browser. The model is
    streamed to the client so that ONNX Runtime Web can run inference locally.

    Returns:
        The raw ONNX model bytes.

    Raises:
        RuntimeError: If the model cannot be downloaded.
    """
    hf_token = _get_hf_token()
    if not hf_token:
        raise RuntimeError(
            "HF_TOKEN is not set. Set HF_TOKEN to download the gated model "
            f"{DEFAULT_HF_REPO}/{DEFAULT_HF_FILENAME}."
        )

    try:
        local_path = hf_hub_download(
            repo_id=DEFAULT_HF_REPO,
            filename=DEFAULT_HF_FILENAME,
            token=hf_token,
        )
        with open(local_path, "rb") as fh:
            return fh.read()
    except Exception as exc:
        raise RuntimeError(
            f"Failed to download model from Hugging Face "
            f"({DEFAULT_HF_REPO}/{DEFAULT_HF_FILENAME}): {exc}"
        ) from exc


def get_model_bytes_io() -> io.BytesIO:
    """
    Download the model and return it as an in-memory byte stream.

    Returns:
        BytesIO containing the ONNX model bytes.
    """
    return io.BytesIO(get_model_bytes())