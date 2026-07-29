"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";

// Detection result type
interface DetectionResult {
  id: number;
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
}

// Model info type
interface ModelInfo {
  model_path: string;
  device: string;
}

// Detection response type
interface DetectionResponse {
  image_url: string;
  detections: DetectionResult[];
  model_info: ModelInfo;
}

// Available model type
interface ModelOption {
  name: string;
  path: string;
  size: number;
}

// Models list response type
interface ModelsListResponse {
  models: ModelOption[];
}

export default function ScansPage() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [detectionResult, setDetectionResult] = useState<DetectionResponse | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [loadingModels, setLoadingModels] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Fetch available models on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/detects/models`);
        if (response.ok) {
          const data: ModelsListResponse = await response.json();
          setAvailableModels(data.models);
          if (data.models.length > 0) {
            setSelectedModel(data.models[0].path);
          }
        }
      } catch (err) {
        console.error("Failed to fetch models:", err);
      } finally {
        setLoadingModels(false);
      }
    };
    fetchModels();
  }, [API_BASE_URL]);

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
    if (!fileInputRef.current?.files?.[0]) return;

    setIsDetecting(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", fileInputRef.current.files[0]);
    if (selectedModel) {
      formData.append("model_path", selectedModel);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/detects/detect`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Detection failed");
      }

      const result = await response.json();
      setDetectionResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred during detection");
    } finally {
      setIsDetecting(false);
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

              {/* Model Selector */}
              <div className="flex justify-center mt-4">
                <div className="flex items-center space-x-3 bg-purple-50 px-4 py-2 rounded-lg">
                  <label htmlFor="model-select" className="text-sm font-medium text-purple-700">
                    Detection Model:
                  </label>
                  <select
                    id="model-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={loadingModels || isDetecting}
                    className="bg-white border border-purple-300 text-purple-800 text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block p-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingModels ? (
                      <option value="">Loading models...</option>
                    ) : availableModels.length === 0 ? (
                      <option value="">No models available</option>
                    ) : (
                      availableModels.map((model) => (
                        <option key={model.path} value={model.path}>
                          {model.name} ({(model.size / (1024 * 1024)).toFixed(1)} MB)
                        </option>
                      ))
                    )}
                  </select>
                  {!loadingModels && (
                    <button
                      onClick={async () => {
                        try {
                          setLoadingModels(true);
                          const response = await fetch(`${API_BASE_URL}/detects/models`);
                          if (response.ok) {
                            const data: ModelsListResponse = await response.json();
                            setAvailableModels(data.models);
                          }
                        } catch (err) {
                          console.error("Failed to refresh models:", err);
                        } finally {
                          setLoadingModels(false);
                        }
                      }}
                      className="p-2 text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded-lg transition-colors"
                      title="Refresh models list"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-center mt-4 space-x-4">
                <button
                  onClick={handleDetect}
                  disabled={isDetecting}
                  className="px-8 py-3 bg-purple-600 text-white rounded-lg text-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isDetecting ? "Detecting..." : "Detect Assets"}
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
                src={`${API_BASE_URL}${detectionResult.image_url}`}
                alt="Detected"
                className="w-full h-auto rounded-lg shadow-md"
                onError={(e) => {
                  // Fallback to original preview image if detected image not available
                  const target = e.target as HTMLImageElement;
                  if (selectedImage) {
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
                  <span className="font-semibold">Device:</span> {detectionResult.model_info.device === "cuda" ? "GPU (CUDA)" : "CPU"}
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