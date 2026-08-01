"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import {
  detectImage,
  drawDetections,
  canvasToJpegBlob,
  loadImageCanvas,
  type DetectionBox,
} from "@/lib/yolo";

// Detection response type
interface DetectionResponse {
  image_url: string;
  original_image_url: string;
  detections: DetectionBox[];
  model_info: {
    model_path: string;
    model_type: string;
    device: string;
  };
}

export default function ScansPage() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [detectionResult, setDetectionResult] = useState<DetectionResponse | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target?.result as string);
        setDetectionResult(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDetect = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setIsDetecting(true);
    setIsDownloadingModel(false);
    setError(null);
    setDetectionResult(null);

    try {
      // Stage 1: Run YOLO detection fully in the browser (downloads the
      // ONNX model from Hugging Face on the first use, then caches it).
      setIsDownloadingModel(true);
      const { detections } = await detectImage(file);
      setIsDownloadingModel(false);

      // Stage 2: Draw bounding boxes on the image and export as JPEG.
      const canvas = await loadImageCanvas(file);
      drawDetections(canvas, detections);
      const annotatedBlob = await canvasToJpegBlob(canvas);

      // Stage 3: Store the original + annotated images and detection
      // results via the slimmed backend (Supabase storage).
      const formData = new FormData();
      formData.append("file", file, file.name || "image.jpg");
      formData.append(
        "annotated_file",
        annotatedBlob,
        "annotated.jpg"
      );
      formData.append("detections", JSON.stringify({ detections }));

      const response = await fetch(`${API_BASE_URL}/detects/detect`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Detection storage failed (HTTP ${response.status})`);
      }

      const result: DetectionResponse = await response.json();
      setDetectionResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred during detection");
    } finally {
      setIsDetecting(false);
      setIsDownloadingModel(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-purple-100 to-purple-200">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-purple-800">Smart Office Asset Management AI</span>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-purple-800 mb-8 text-center">
          Scan Your Office Assets
        </h1>

        {/* Upload Section */}
        <div className="bg-white/90 rounded-2xl p-8 shadow-lg mb-8">
          <div className="border-2 border-dashed border-purple-300 rounded-lg p-12 text-center">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
              id="image-upload"
            />
            <label
              htmlFor="image-upload"
              className="cursor-pointer"
            >
              <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.23A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.23A2 2 0 0017.07 7H18a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 116 0" />
                </svg>
              </div>
              <p className="text-lg text-purple-700 mb-2">Click to upload an image</p>
              <p className="text-sm text-purple-500">PNG, JPG, GIF up to 10MB</p>
            </label>
          </div>

          {selectedImage && (
            <div className="mt-6">
              <div className="relative w-full max-w-lg mx-auto">
                <img
                  src={selectedImage}
                  alt="Preview"
                  className="w-full h-auto rounded-lg shadow-md"
                />
              </div>

              <div className="flex justify-center mt-4 space-x-4">
                <button
                  onClick={handleDetect}
                  disabled={isDetecting}
                  className="px-8 py-3 bg-purple-600 text-white rounded-lg text-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isDetecting
                    ? isDownloadingModel
                      ? "Downloading model…"
                      : "Detecting…"
                    : "Detect Assets"}
                </button>
                <button
                  onClick={() => {
                    setSelectedImage(null);
                    setDetectionResult(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  className="px-8 py-3 bg-white text-purple-600 rounded-lg text-lg font-semibold border-2 border-purple-300 hover:bg-purple-50 transition-colors"
                >
                  Remove Image
                </button>
              </div>

              {isDownloadingModel && (
                <p className="text-sm text-purple-500 text-center mt-3">
                  This is the first run. The AI model is being downloaded from Hugging Face
                  (~a few MB) and will be cached in your browser for future scans.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Detection Results */}
        {detectionResult && (
          <div className="bg-white/90 rounded-2xl p-8 shadow-lg">
            <h2 className="text-2xl font-bold text-purple-800 mb-6">Detection Results</h2>

            <div className="relative w-full max-w-lg mx-auto mb-6">
              <img
                src={detectionResult.image_url}
                alt="Detected"
                className="w-full h-auto rounded-lg shadow-md"
                onError={(e) => {
                  // Fallback to original image URL if detected image not available
                  const target = e.target as HTMLImageElement;
                  if (detectionResult.original_image_url) {
                    target.src = detectionResult.original_image_url;
                  } else if (selectedImage) {
                    target.src = selectedImage;
                  }
                }}
              />
            </div>

            {detectionResult.model_info && (
              <div className="mb-4 p-3 bg-purple-100 rounded-lg">
                <p className="text-sm text-purple-800">
                  <span className="font-semibold">Model:</span> {detectionResult.model_info.model_path ? detectionResult.model_info.model_path.split(/[/\\]/).pop() : "Not found"}
                </p>
                <p className="text-sm text-purple-800">
                  <span className="font-semibold">Type:</span> {detectionResult.model_info.model_type === "onnx" || detectionResult.model_info.model_type === "onnx-web" ? "ONNX Runtime Web" : detectionResult.model_info.model_type}
                </p>
                <p className="text-sm text-purple-800">
                  <span className="font-semibold">Device:</span> {detectionResult.model_info.device === "cuda" ? "GPU (CUDA)" : detectionResult.model_info.device === "webgpu/wasm" ? "WebGPU / WASM" : detectionResult.model_info.device}
                </p>
              </div>
            )}

            <h3 className="text-lg font-semibold text-purple-700 mb-4">Detected Assets:</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {detectionResult.detections.map((detection) => (
                <div
                  key={detection.id}
                  className="bg-purple-50 rounded-lg p-4 flex justify-between items-center"
                >
                  <span className="font-medium text-purple-800">{detection.label}</span>
                  <span className="text-purple-600 bg-white px-3 py-1 rounded-full text-sm">
                    {(detection.confidence * 100).toFixed(1)}% confidence
                  </span>
                </div>
              ))}
            </div>

            {detectionResult.detections.length === 0 && (
              <p className="text-purple-600 text-center">No assets detected in this image.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}