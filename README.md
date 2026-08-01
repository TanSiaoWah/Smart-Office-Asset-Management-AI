# Smart Office Asset Management AI

AI-powered office asset management system that uses computer vision to identify office equipment, track maintenance schedules, and manage inventory.

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, PostgreSQL
- **Frontend**: Next.js, TypeScript, TailwindCSS
- **AI**: YOLO (best.onnx) via **ONNX Runtime Web** — detection runs **entirely in the browser**
- **Storage**: Supabase Storage (bucket-based image storage)

## How Detection Works (Client-Side)

Detection no longer runs on the backend. Instead:

1. The browser downloads the YOLO `best.onnx` model from the backend proxy
   endpoint `GET /detects/model`. The backend downloads it from the gated
   Hugging Face repo `ZiRanZ/smart-office-yolo26` using the server-side
   `HF_TOKEN` (never exposed to the browser) and streams the bytes back.
2. The browser **caches the model via the Cache API** — it is only downloaded
   once per browser.
3. ONNX Runtime Web runs inference **in the browser** using **WebGPU** with an
   automatic **WebAssembly (WASM)** fallback for older browsers.
4. Bounding boxes are drawn on a `<canvas>` in the browser (purple theme).
5. The original image, the annotated image, and the detection JSON are sent to
   the slimmed backend, which stores them in Supabase Storage and returns the
   public image URLs for display.

> **Note:** The Hugging Face repo `ZiRanZ/smart-office-yolo26` is **gated**
> (requires authentication), so the browser cannot download `best.onnx`
> directly. The backend streams it through `GET /detects/model` using
> `HF_TOKEN` stored in the backend environment.

Because the ML stack (PyTorch/Ultralytics/ONNX Runtime server) was removed from
the backend, the Render free tier (512 MB) is no longer at risk of running out
of memory.

## Features

- **Smart Asset Scanning** - Upload images and detect office assets (Desk, Chair, Computer monitor) using YOLO directly in your browser
- **Client-Side Inference** - The YOLO ONNX model runs on your device (WebGPU/WASM) — no server-side ML processing
- **Cloud Image Storage** - Original and annotated images are stored in a Supabase Storage bucket
- **Maintenance scheduling and notifications** - Never miss equipment maintenance
- **Asset documentation and insights** - Discover asset documentation and usage insights

## Live Deployments

- **Backend (Render)**: [https://smart-office-asset-management-ai.onrender.com/](https://smart-office-asset-management-ai.onrender.com/)
- **Frontend (Vercel)**: [https://smart-office-asset.vercel.app/](https://smart-office-asset.vercel.app/)

## Getting Started (Local Development)

### Backend Setup

```bash
cd backend
python -m venv office
office\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
├── backend/                    # FastAPI backend server (storage-only)
│   ├── main.py                 # FastAPI application entry point
│   ├── requirements.txt        # Python dependencies
│   ├── .env                    # Environment variables
│   ├── assets/
│   │   ├── router.py           # Endpoints (/detects/*) incl. model proxy
│   │   ├── service.py          # Pydantic schemas + HF model download helper
│   │   └── storage.py          # Supabase Storage service
│   ├── models/                 # Local model files (kept out of git; models
│   │   │                       # are fetched from Hugging Face at runtime)
│   └── uploads/                # Local fallback directory (not used when Supabase is configured)
├── frontend/                   # Next.js frontend application (client-side detection)
│   ├── app/
│   │   ├── page.tsx            # Main landing page with purple theme
│   │   ├── layout.tsx          # Root layout
│   │   ├── globals.css         # Global styles
│   │   ├── scans/
│   │   │   └── page.tsx        # Image upload and client-side detection page
│   │   └── test-connection/    # Backend connectivity check page
│   ├── src/
│   │   └── lib/
│   │       └── yolo.ts         # ONNX Runtime Web inference (download, preprocess, postprocess)
│   └── package.json            # Node.js dependencies
├── Test_Images/                # Sample test images for development
└── README.md
```

## API Endpoints

### `GET /detects/model`

Streams the `best.onnx` model to the browser for client-side inference. The
model is downloaded from the gated Hugging Face repo
`ZiRanZ/smart-office-yolo26` using the server-side `HF_TOKEN` and returned as
`application/octet-stream`. The browser caches the response via the Cache API.

### `GET /detects/models`

Lists the detection model used by the browser. Since inference runs client-side,
this returns a static descriptor for `best.onnx` (kept for connection checks).

**Response:**
```json
{
  "models": [
    {
      "name": "best.onnx",
      "path": "models/best.onnx",
      "size": 0
    }
  ]
}
```

### `POST /detects/detect`

Stores the original image, the browser-annotated image, and the client-side
detection results in Supabase Storage.

**Request (multipart/form-data):**
- `file` (required) - Original image file
- `annotated_file` (optional) - Image with bounding boxes drawn by the client
- `detections` (optional) - JSON string of the detection payload:
  ```json
  {
    "detections": [
      { "id": 0, "label": "Chair", "confidence": 0.95, "bbox": [100, 200, 300, 400] }
    ],
    "model_path": "best.onnx",
    "model_type": "onnx-web",
    "device": "webgpu/wasm"
  }
  ```

**Response:**
```json
{
  "image_url": "https://your-project.supabase.co/storage/v1/object/public/images/detected_20260729_132116_f150d6bf.jpg",
  "original_image_url": "https://your-project.supabase.co/storage/v1/object/public/images/original_20260729_132116_f150d6bf.jpg",
  "detections": [
    {
      "id": 0,
      "label": "Chair",
      "confidence": 0.95,
      "bbox": [100, 200, 300, 400]
    }
  ],
  "model_info": {
    "model_path": "models/best.onnx",
    "model_type": "onnx-web",
    "device": "webgpu/wasm"
  }
}
```

## Environment Variables

Create a `.env` file in the `backend/` directory with:

```
# Hugging Face token for the gated model repo (ZiRanZ/smart-office-yolo26)
# https://huggingface.co/settings/tokens
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxx

# Supabase Storage Configuration
# Use the service_role key (NOT anon key) to bypass RLS policies
# Find it in Supabase Dashboard → Settings → API → service_role key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_BUCKET_NAME=images
```

And in the project root for the frontend (use the Render URL for production, or `http://localhost:8000` for local dev):

```
NEXT_PUBLIC_API_URL=https://smart-office-asset-management-ai.onrender.com
```

`NEXT_PUBLIC_ONNX_MODEL_URL` is optional — by default the browser fetches the
model from the backend proxy at `<NEXT_PUBLIC_API_URL>/detects/model`.

### Environment Variable Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `HF_TOKEN` | — | Hugging Face token required to download the gated `ZiRanZ/smart-office-yolo26` model |
| `SUPABASE_URL` | — | Supabase project URL (required for cloud storage) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase service_role key (required, bypasses RLS) |
| `SUPABASE_BUCKET_NAME` | `images` | Supabase Storage bucket name for uploaded images (case-sensitive) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API base URL |
| `NEXT_PUBLIC_ONNX_MODEL_URL` | `<NEXT_PUBLIC_API_URL>/detects/model` | Optional direct URL to the `best.onnx` model downloaded by the browser (defaults to the backend proxy) |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed CORS origins (comma-separated, add your Vercel URL for production) |

## Image Storage

All uploaded original images and detected (annotated) images are stored in a **Supabase Storage bucket** named `images` (configurable via `SUPABASE_BUCKET_NAME`). The bucket is set to **public** so that the frontend can display the images directly via their public URLs.

- **Original images** are uploaded with the prefix `original_<timestamp>_<uuid>.jpg`
- **Detected images** (with bounding boxes drawn client-side) are uploaded with the prefix `detected_<timestamp>_<uuid>.jpg`

If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not set, the `SupabaseStorageService` will raise a `ValueError` at startup.

## Browser-Side Detection (ONNX Runtime Web)

Detection happens entirely in the user's browser — no server-side ML processing.

### How it works

1. **Model download & caching** — On first detection, the browser fetches
   `best.onnx` from the backend proxy `GET /detects/model` (which uses the
   server-side `HF_TOKEN` to download from the gated Hugging Face repo) and
   stores it via the Cache API. Subsequent scans reuse the cached model
   instantly.
2. **Inference** — ONNX Runtime Web runs the model using **WebGPU** when
   available, falling back to **WebAssembly** on older browsers.
3. **Preprocessing** — The image is letterboxed to 640×640 and normalized to a
   `[1, 3, 640, 640]` float32 tensor (matching the original server-side math).
4. **Postprocessing** — The model's end-to-end output (with NMS baked in) is
   decoded, un-letterboxed, clipped to the original image bounds, and mapped to
   the office asset classes (`Desk`, `Chair`, `Computer monitor`).
5. **Annotation & upload** — Bounding boxes are drawn on a `<canvas>`, exported
   as a JPEG, and uploaded (with the original image and detection JSON) to the
   backend for Supabase storage.

### Supported Output Formats

The client decoder handles all common Ultralytics ONNX exports:

- End-to-end output `[1, maxDet, 6]` (`[x1, y1, x2, y2, confidence, class_id]`, NMS baked in)
- Transposed end-to-end output `[1, 6, maxDet]`
- Raw output `[1, 4+classes, N]` (NMS applied client-side)

### Model Caching

The downloaded ONNX model is cached in the browser's **Cache API**. It is
downloaded once and reused for all future detections in the same browser.

## Frontend Features

- **Image Upload** - Drag-and-drop or click to upload images for analysis
- **Client-Side Detection** - Detection runs locally in your browser (via WebGPU/WASM) — no server-side ML needed
- **Real-time Detection** - View detection results with confidence scores
- **Annotated Images** - See bounding boxes drawn directly in the browser on detected objects
- **Model Info Display** - View which model and device (WebGPU/WASM) was used for inference
- **Responsive Design** - Purple-themed UI built with TailwindCSS

## Development

### Updating the Detection Model

1. Export a new YOLO model to ONNX (e.g. `yolo export model=best.pt format=onnx`)
2. Upload `best.onnx` to the Hugging Face repo `ZiRanZ/smart-office-yolo26`
   (the backend streams it to the browser via `GET /detects/model`)
3. Bump the model version so browsers re-download it — either set
   `NEXT_PUBLIC_ONNX_MODEL_URL` to the new URL in the frontend environment, or
   bump the `MODEL_CACHE` name in `frontend/src/lib/yolo.ts`

### Training Custom Models

To train a custom YOLO model for office asset detection:

1. Prepare your dataset with images and annotations
2. Create a dataset YAML configuration file (see `backend/models/dataset.yaml` for reference)
3. Use the Ultralytics YOLO training pipeline:
   ```python
   from ultralytics import YOLO
   model = YOLO("yolo26n.pt")  # or any base model
   model.train(data="dataset.yaml", epochs=100, imgsz=640)
   ```
4. Export to ONNX and upload it to Hugging Face (`ZiRanZ/smart-office-yolo26`),
   then the backend serves it via `GET /detects/model`