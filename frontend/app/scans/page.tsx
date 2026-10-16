"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import {
  detectImage,
  drawDetections,
  canvasToJpegBlob,
  loadImageCanvas,
  type DetectionBox,
} from "@/lib/yolo";
import { supabaseBrowser } from "@/lib/supabase-browser";
import BackendWakingNotice from "@/components/BackendWakingNotice";

// Detection response type
interface DetectionResponse {
  image_id: string;
  image_url: string;
  original_image_url: string;
  detections: DetectionBox[];
  model_info: {
    model_path: string;
    model_type: string;
    device: string;
  };
}

interface Room {
  id: string;
  name: string;
  created_at: string;
}

interface SaveableDetection {
  id: number;
  label: string;
  confidence: number | null;
  bbox: [number, number, number, number] | null;
  name: string;
  selected: boolean;
}

export default function ScansPage() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [detectionResult, setDetectionResult] = useState<DetectionResponse | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [saveableDetections, setSaveableDetections] = useState<SaveableDetection[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [manualAssetName, setManualAssetName] = useState("");
  const [showStorageWait, setShowStorageWait] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storageWaitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Check login state and fetch the user's rooms.
  useEffect(() => {
    supabaseBrowser.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setIsLoggedIn(true);
        await fetchRooms(session.access_token);
      }
    });
  }, []);

  // Clear any pending wake-notice timer on unmount.
  useEffect(() => {
    return () => {
      if (storageWaitTimer.current) {
        clearTimeout(storageWaitTimer.current);
      }
    };
  }, []);

  const fetchRooms = async (accessToken: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/rooms`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data: Room[] = await res.json();
        setRooms(data);
      }
    } catch {
      // Non-fatal: rooms will be empty until the user logs in.
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target?.result as string);
        setDetectionResult(null);
        setSaveableDetections([]);
        setSelectedRoomId("");
        setSaveMessage(null);
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
    setSaveableDetections([]);
    setSaveMessage(null);

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
      // If the Render free-tier backend is asleep, this request stalls for
      // up to ~1 minute while it wakes up. After 5s, show an inline notice
      // explaining the wait instead of leaving the user with a bare spinner.
      storageWaitTimer.current = setTimeout(() => setShowStorageWait(true), 5000);

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

      // Initialize saveable detections (all selected by default, no room).
      setSaveableDetections(
        result.detections.map((detection) => ({
          id: detection.id,
          label: detection.label,
          confidence: detection.confidence,
          bbox: detection.bbox,
          name: detection.label,
          selected: true,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred during detection");
    } finally {
      if (storageWaitTimer.current) {
        clearTimeout(storageWaitTimer.current);
        storageWaitTimer.current = null;
      }
      setShowStorageWait(false);
      setIsDetecting(false);
      setIsDownloadingModel(false);
    }
  };

  const handleSaveToInventory = async () => {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session) {
      setSaveMessage("Please log in to save assets to your inventory.");
      return;
    }

    const selectedItems = saveableDetections.filter((d) => d.selected);
    if (selectedItems.length === 0 || !detectionResult) {
      setSaveMessage("Select at least one asset to save.");
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);
    setError(null);

    try {
      const items = selectedItems.map((d) => ({
        name: d.name.trim() || d.label,
        room_id: selectedRoomId || null,
        image_id: detectionResult.image_id,
        image_url: detectionResult.image_url,
        confidence: d.confidence,
        bbox: d.bbox,
      }));

      const res = await fetch(`${API_BASE_URL}/inventory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) {
        throw new Error(`Failed to save to inventory (HTTP ${res.status})`);
      }

      setSaveMessage(`Saved ${items.length} asset(s) to your inventory.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save to inventory");
    } finally {
      setIsSaving(false);
    }
  };

  const updateSaveableDetection = (id: number, patch: Partial<SaveableDetection>) => {
    setSaveableDetections((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
    );
  };

  const handleRemoveDetection = (id: number) => {
    setSaveableDetections((prev) => prev.filter((d) => d.id !== id));
  };

  const handleAddManualAsset = () => {
    const name = manualAssetName.trim();
    if (!name) return;
    const nextId =
      saveableDetections.length > 0
        ? Math.max(...saveableDetections.map((d) => d.id)) + 1
        : 0;
    setSaveableDetections((prev) => [
      ...prev,
      {
        id: nextId,
        label: name,
        confidence: null,
        bbox: null,
        name,
        selected: true,
      },
    ]);
    setManualAssetName("");
    setIsAddingManual(false);
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
          <div className="flex items-center space-x-4">
            <Link href="/inventory" className="px-4 py-2 text-purple-600 hover:text-purple-800 transition-colors">
              My Inventory
            </Link>
            {!isLoggedIn && (
              <Link href="/login?next=/scans">
                <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                  Log in to save
                </button>
              </Link>
            )}
          </div>
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
                    setSaveableDetections([]);
                    setSelectedRoomId("");
                    setSaveMessage(null);
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

              {showStorageWait && !isDownloadingModel && (
                <BackendWakingNotice variant="inline" />
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

            {/* Single room selector for all checked assets */}
            <div className="mb-4 p-4 bg-purple-100 rounded-lg flex items-center gap-3">
              <label htmlFor="room-select" className="text-sm text-purple-800 font-medium whitespace-nowrap">
                Assign all checked assets to room:
              </label>
              <select
                id="room-select"
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="flex-1 px-3 py-2 border-2 border-purple-300 rounded-lg text-purple-800 focus:border-purple-500 focus:outline-none"
              >
                <option value="">No room (unassigned)…</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {saveableDetections.map((detection) => (
                <div
                  key={detection.id}
                  className="bg-purple-50 rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between items-center">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={detection.selected}
                        onChange={(e) => updateSaveableDetection(detection.id, { selected: e.target.checked })}
                        className="w-4 h-4 text-purple-600 rounded"
                      />
                      <span className="font-medium text-purple-800">{detection.label}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      {detection.confidence !== null ? (
                        <span className="text-purple-600 bg-white px-3 py-1 rounded-full text-sm">
                          {(detection.confidence * 100).toFixed(1)}% confidence
                        </span>
                      ) : (
                        <span className="text-purple-500 bg-white px-3 py-1 rounded-full text-sm">
                          Manual
                        </span>
                      )}
                      <button
                        onClick={() => handleRemoveDetection(detection.id)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                        title="Remove asset"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={detection.name}
                    onChange={(e) => updateSaveableDetection(detection.id, { name: e.target.value })}
                    placeholder="Asset name"
                    className="w-full px-3 py-2 border-2 border-purple-300 rounded-lg text-purple-800 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>

            {/* Add manual asset */}
            <div className="mt-4">
              {isAddingManual ? (
                <div className="flex items-center gap-3 bg-purple-100 rounded-lg p-4">
                  <input
                    type="text"
                    value={manualAssetName}
                    onChange={(e) => setManualAssetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddManualAsset();
                    }}
                    placeholder="Asset name (e.g. Whiteboard)"
                    className="flex-1 px-3 py-2 border-2 border-purple-300 rounded-lg text-purple-800 focus:border-purple-500 focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleAddManualAsset}
                    disabled={!manualAssetName.trim()}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingManual(false);
                      setManualAssetName("");
                    }}
                    className="px-4 py-2 bg-white text-purple-600 rounded-lg text-sm border-2 border-purple-300 hover:bg-purple-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingManual(true)}
                  className="px-4 py-2 bg-white text-purple-600 rounded-lg text-sm border-2 border-purple-300 hover:bg-purple-50 transition-colors"
                >
                  + Add Asset
                </button>
              )}
            </div>

            {saveableDetections.length === 0 && (
              <p className="text-purple-600 text-center mt-4">No assets in this scan. Add one manually above.</p>
            )}

            {saveableDetections.length > 0 && (
              <div className="mt-6 flex flex-col items-center space-y-3">
                <button
                  onClick={handleSaveToInventory}
                  disabled={isSaving}
                  className="px-8 py-3 bg-purple-600 text-white rounded-lg text-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving ? "Saving…" : "Save to Inventory"}
                </button>
                {!isLoggedIn && (
                  <p className="text-sm text-purple-500">
                    You need to be logged in to save assets.{" "}
                    <Link href="/login?next=/scans" className="text-purple-700 underline">
                      Log in
                    </Link>
                  </p>
                )}
                {saveMessage && (
                  <p className="text-sm text-purple-700 bg-purple-100 px-4 py-2 rounded-lg">
                    {saveMessage}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}