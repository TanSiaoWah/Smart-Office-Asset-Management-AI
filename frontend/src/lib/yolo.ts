/**
 * Browser-side YOLO detection using ONNX Runtime Web.
 *
 * The `best.onnx` model is downloaded through the backend proxy endpoint
 * `/detects/model` (which fetches it from the gated Hugging Face repo using
 * the server-side HF_TOKEN) and cached via the Cache API so it is only
 * downloaded once per browser. Detection runs entirely in the browser via
 * the WebAssembly (WASM) execution provider.
 */
"use client";

import * as ort from "onnxruntime-web";

export interface DetectionBox {
  id: number;
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface DetectResult {
  detections: DetectionBox[];
  modelUrl: string;
}

/** Office asset class names matching backend/models/dataset.yaml. */
const CLASS_NAMES: string[] = ["Desk", "Chair", "Computer monitor"];

/** Backend proxy endpoint that streams the gated Hugging Face model. */
export const DEFAULT_ONNX_URL =
  process.env.NEXT_PUBLIC_ONNX_MODEL_URL ??
  `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/detects/model`;

/** onnxruntime-web WASM files are served from jsDelivr to avoid bundling issues. */
const ONNX_VERSION = "1.19.2";
const WASM_PATH = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_VERSION}/dist/`;

/** Cache API store name for the downloaded model. */
const MODEL_CACHE = "yolo-models-v1";

const IMG_SIZE = 640;
const CONF_THRES = 0.25;
const IOU_THRES = 0.45;

let sessionPromise: Promise<ort.InferenceSession> | null = null;

async function fetchModelWithCache(): Promise<ArrayBuffer> {
  if (typeof caches === "undefined") {
    const res = await fetch(DEFAULT_ONNX_URL);
    if (!res.ok) {
      throw new Error(`Model download failed (HTTP ${res.status})`);
    }
    return res.arrayBuffer();
  }

  const cache = await caches.open(MODEL_CACHE);
  const cached = await cache.match(DEFAULT_ONNX_URL);
  if (cached?.ok) {
    return cached.arrayBuffer();
  }

  const res = await fetch(DEFAULT_ONNX_URL);
  if (!res.ok) {
    throw new Error(`Model download failed (HTTP ${res.status})`);
  }
  const clone = res.clone();
  await cache.put(DEFAULT_ONNX_URL, clone);
  return res.arrayBuffer();
}

/**
 * Get (and lazily create) the cached ONNX inference session.
 *
 * The session is created once and reused for all subsequent detections.
 *
 * Returns:
 *     Promise resolving to an ONNX Runtime Web InferenceSession.
 */
export async function getModelSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      if (typeof document !== "undefined") {
        ort.env.wasm.wasmPaths = WASM_PATH;
      }
      const modelData = await fetchModelWithCache();
      return ort.InferenceSession.create(modelData, {
        // Use the WASM provider only. The WebGPU provider is still
        // experimental in onnxruntime-web and can throw cryptic errors
        // (e.g. "e.getValue is not a function") for unsupported ops.
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    })().catch((err: unknown) => {
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

/**
 * Load an image Blob/File into a canvas.
 *
 * Args:
 *     file: Image file or blob uploaded by the user.
 *
 * Returns:
 *     A canvas containing the decoded image at its natural resolution.
 */
export async function loadImageCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || 640;
    canvas.height = img.naturalHeight || 640;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context is not supported");
    }
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Preprocessed {
  tensor: ort.Tensor;
  scale: number;
  padX: number;
  padY: number;
}

/**
 * Letterbox-preprocess a canvas into the model's expected [1, 3, 640, 640]
 * float32 tensor (matches the backend's original preprocessing math).
 */
function preprocess(canvas: HTMLCanvasElement): Preprocessed {
  const srcW = canvas.width;
  const srcH = canvas.height;
  const target = IMG_SIZE;
  const scale = Math.min(target / srcW, target / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padX = (target - newW) / 2;
  const padY = (target - newH) / 2;

  const resized = document.createElement("canvas");
  resized.width = target;
  resized.height = target;
  const ctx = resized.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is not supported");
  }

  // Fill with 114 (Ultralytics letterbox gray), then draw the scaled image.
  ctx.fillStyle = "#727272";
  ctx.fillRect(0, 0, target, target);
  ctx.drawImage(canvas, padX, padY, newW, newH);

  const imageData = ctx.getImageData(0, 0, target, target);
  const data = imageData.data; // RGBA
  const size = target * target;
  const input = new Float32Array(3 * size);

  for (let i = 0; i < size; i++) {
    input[i] = data[i * 4] / 255;
    input[size + i] = data[i * 4 + 1] / 255;
    input[2 * size + i] = data[i * 4 + 2] / 255;
  }

  return {
    tensor: new ort.Tensor("float32", input, [1, 3, target, target]),
    scale,
    padX,
    padY,
  };
}

interface RawBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  classId: number;
}

function intersectionOverUnion(a: RawBox, b: RawBox): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const inter = interW * interH;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Greedy Non-Maximum Suppression used for raw (non end-to-end) model outputs.
 */
function nms(boxes: RawBox[], threshold: number): RawBox[] {
  const sorted = [...boxes].sort((p, q) => q.confidence - p.confidence);
  const picked: RawBox[] = [];
  const suppressed = new Array(sorted.length).fill(false);

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed[i]) continue;
    picked.push(sorted[i]);
    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed[j]) continue;
      if (intersectionOverUnion(sorted[i], sorted[j]) > threshold) {
        suppressed[j] = true;
      }
    }
  }

  return picked;
}

function finalize(
  boxes: RawBox[],
  origW: number,
  origH: number,
  applyNms: boolean
): DetectionBox[] {
  const selected = applyNms ? nms(boxes, IOU_THRES) : boxes;
  const results: DetectionBox[] = [];

  for (const raw of selected) {
    const x1 = Math.max(0, Math.min(raw.x1, origW));
    const y1 = Math.max(0, Math.min(raw.y1, origH));
    const x2 = Math.max(0, Math.min(raw.x2, origW));
    const y2 = Math.max(0, Math.min(raw.y2, origH));

    results.push({
      id: results.length,
      label: CLASS_NAMES[raw.classId] ?? `class_${raw.classId}`,
      confidence: raw.confidence,
      bbox: [x1, y1, x2, y2],
    });
  }

  return results;
}

/** Decode an Ultralytics raw output [1, C, N] where C = 4 + numClasses. */
function decodeRawBoxes(
  data: Float32Array,
  numBoxes: number,
  numChannels: number,
  scale: number,
  padX: number,
  padY: number
): RawBox[] {
  const numClasses = numChannels - 4;
  const boxes: RawBox[] = [];

  for (let j = 0; j < numBoxes; j++) {
    const cx = data[j];
    const cy = data[numBoxes + j];
    const w = data[2 * numBoxes + j];
    const h = data[3 * numBoxes + j];

    let bestClass = -1;
    let bestScore = CONF_THRES;
    for (let c = 0; c < numClasses; c++) {
      const score = data[(4 + c) * numBoxes + j];
      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }
    if (bestClass < 0) continue;

    boxes.push({
      x1: (cx - w / 2 - padX) / scale,
      y1: (cy - h / 2 - padY) / scale,
      x2: (cx + w / 2 - padX) / scale,
      y2: (cy + h / 2 - padY) / scale,
      confidence: bestScore,
      classId: bestClass,
    });
  }

  return boxes;
}

/**
 * Parse the model output into detection results.
 *
 * Supports:
 *  - End-to-end Ultralytics ONNX output [1, maxDet, 6] (NMS baked in).
 *  - Transposed end-to-end output [1, 6, maxDet].
 *  - Raw output [1, 4+classes, N] (NMS applied client-side).
 */
function decodeOutput(
  output: ort.Tensor,
  scale: number,
  padX: number,
  padY: number,
  origW: number,
  origH: number
): DetectionBox[] {
  const data = output.data as Float32Array;
  const dims = output.dims;

  if (dims.length !== 3) {
    return [];
  }

  const [batch, dim1, dim2] = dims;

  // End-to-end format: [1, maxDet, 6] -> [x1, y1, x2, y2, conf, class_id]
  if (dim2 === 6) {
    const boxes: RawBox[] = [];
    for (let i = 0; i < dim1; i++) {
      const off = i * 6;
      const confidence = data[off + 4];
      if (confidence < CONF_THRES) continue;
      boxes.push({
        x1: (data[off] - padX) / scale,
        y1: (data[off + 1] - padY) / scale,
        x2: (data[off + 2] - padX) / scale,
        y2: (data[off + 3] - padY) / scale,
        confidence,
        classId: Math.round(data[off + 5]),
      });
    }
    return finalize(boxes, origW, origH, false);
  }

  // Transposed end-to-end format: [1, 6, maxDet]
  if (dim1 === 6) {
    const numBoxes = dim2;
    const boxes: RawBox[] = [];
    for (let i = 0; i < numBoxes; i++) {
      const confidence = data[4 * numBoxes + i];
      if (confidence < CONF_THRES) continue;
      boxes.push({
        x1: (data[i] - padX) / scale,
        y1: (data[numBoxes + i] - padY) / scale,
        x2: (data[2 * numBoxes + i] - padX) / scale,
        y2: (data[3 * numBoxes + i] - padY) / scale,
        confidence,
        classId: Math.round(data[5 * numBoxes + i]),
      });
    }
    return finalize(boxes, origW, origH, false);
  }

  // Raw format: [1, C, N] with C = 4 + numClasses (Ultralytics export)
  if (batch === 1 && dim1 > 6) {
    const boxes = decodeRawBoxes(data, dim2, dim1, scale, padX, padY);
    return finalize(boxes, origW, origH, true);
  }

  return [];
}

/**
 * Run YOLO detection on an image canvas entirely in the browser.
 *
 * Args:
 *     canvas: Canvas containing the source image.
 *
 * Returns:
 *     Detected assets and the model URL used.
 */
export async function detectFromCanvas(
  canvas: HTMLCanvasElement
): Promise<DetectResult> {
  const session = await getModelSession();
  const origW = canvas.width;
  const origH = canvas.height;

  const { tensor, scale, padX, padY } = preprocess(canvas);

  const feeds: Record<string, ort.Tensor> = {
    [session.inputNames[0]]: tensor,
  };

  const results = await session.run(feeds);
  const output = results[session.outputNames[0]];

  const detections = decodeOutput(output, scale, padX, padY, origW, origH);

  return {
    detections,
    modelUrl: DEFAULT_ONNX_URL,
  };
}

/**
 * Run YOLO detection on an image file/blob.
 *
 * Args:
 *     file: Uploaded image file.
 *
 * Returns:
 *     Detected assets and the model URL used.
 */
export async function detectImage(file: Blob): Promise<DetectResult> {
  const canvas = await loadImageCanvas(file);
  return detectFromCanvas(canvas);
}

/**
 * Draw bounding boxes and labels onto a canvas (purple theme).
 */
export function drawDetections(
  canvas: HTMLCanvasElement,
  detections: DetectionBox[]
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const colors = ["#a855f7", "#9333ea", "#7e22ce", "#6b21a8"];

  detections.forEach((detection, i) => {
    const [x1, y1, x2, y2] = detection.bbox;
    const color = colors[i % colors.length];

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    const label = `${detection.label} ${(detection.confidence * 100).toFixed(1)}%`;
    ctx.font = "14px sans-serif";
    const textWidth = ctx.measureText(label).width;

    ctx.fillStyle = color;
    ctx.fillRect(x1, y1 - 24, textWidth + 10, 24);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x1 + 5, y1 - 7);
  });
}

/**
 * Export a canvas as a JPEG Blob.
 *
 * Args:
 *     canvas: Canvas to export.
 *     quality: JPEG quality in [0, 1].
 *
 * Returns:
 *     Promise resolving to a JPEG Blob.
 */
export function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to export annotated image"));
        }
      },
      "image/jpeg",
      quality
    );
  });
}