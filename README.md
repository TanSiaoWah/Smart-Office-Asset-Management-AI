# Smart Office Asset Management AI

AI-powered office asset management system that uses computer vision to identify office equipment, track maintenance schedules, and manage inventory.

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, PostgreSQL
- **Frontend**: Next.js, TypeScript, TailwindCSS
- **AI**: YOLO (best.onnx) via **ONNX Runtime Web** — detection runs **entirely in the browser**
- **Storage**: Supabase Storage (bucket-based image storage)
- **Auth**: Google SSO via **Supabase Auth** — profiles stored in PostgreSQL with UUID + role field

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
- **Inventory Management** - Save detected assets into your personal inventory, labeled with the room they belong to
- **Per-Date Summary with Pie Chart** - Defaults to today's assets and shows a pie chart breaking down total chairs, desks, and monitors, with a date selector to view previous days' summaries
- **Per-Room Asset Counts** - View per-room asset counts (e.g. "Meeting Room: 4 Chairs, 1 Desk, 1 Monitor") for the selected date
- **Scan History** - Every save-to-inventory action is recorded as a chronologically numbered scan (e.g. "Scan #1: saved Chair 1, Chair 2, Desk 1") showing how many assets, in which room, and on which date
- **Room Management** - Define your own rooms (e.g. "Room A", "Room B") and assign detected assets to them via a dropdown
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
├── backend/                    # FastAPI backend server (storage + auth)
│   ├── main.py                 # FastAPI application entry point
│   ├── database.py             # SQLAlchemy engine, session, Base
│   ├── requirements.txt        # Python dependencies
│   ├── .env                    # Environment variables
│   ├── assets/
│   │   ├── router.py           # Endpoints (/detects/*) incl. model proxy
│   │   ├── service.py          # Pydantic schemas + HF model download helper
│   │   └── storage.py          # Supabase Storage service
│   ├── inventory/              # Room + inventory + scan-history package
│   │   ├── models.py           # Room + InventoryItem + Scan ORM models
│   │   ├── schemas.py          # Pydantic schemas (RoomIn/Out, InventoryItem*, ScanOut)
│   │   ├── service.py          # Room CRUD + inventory create/list/delete + scan history logic
│   │   └── router.py           # Endpoints (/rooms, /inventory, /scans)
│   ├── auth/                   # Google SSO authentication package
│   │   ├── models.py           # Profile ORM model (UUID, email, name, role)
│   │   ├── schemas.py          # Pydantic schemas (ProfileOut, AuthResponse)
│   │   ├── service.py          # JWT verification + profile upsert logic
│   │   ├── dependencies.py     # get_current_profile dependency
│   │   └── router.py           # Endpoints (/auth/google, /auth/me)
│   ├── models/                 # Local model files (kept out of git; models
│   │   │                       # are fetched from Hugging Face at runtime)
│   └── uploads/                # Local fallback directory (not used when Supabase is configured)
├── frontend/                   # Next.js frontend application (client-side detection)
│   ├── middleware.ts           # Supabase session refresh + route protection
│   ├── app/
│   │   ├── page.tsx            # Main landing page with purple theme
│   │   ├── layout.tsx          # Root layout
│   │   ├── globals.css         # Global styles
│   │   ├── login/
│   │   │   └── page.tsx        # Google SSO login page
│   │   ├── profile/
│   │   │   └── page.tsx        # User profile page (view + edit name)
│   │   ├── auth/
│   │   │   └── callback/
│   │   │       └── route.ts    # OAuth callback (code → session → profile sync)
│   │   ├── scans/
│   │   │   └── page.tsx        # Image upload, detection, and save-to-inventory page
│   │   ├── inventory/
│   │   │   └── page.tsx        # Per-date pie chart summary, scan history, and room management
│   │   └── test-connection/    # Backend connectivity check page
│   ├── src/
│   │   ├── components/
│   │   │   └── NavAuth.tsx     # Login/Logout nav buttons (client component)
│   │   └── lib/
│   │       ├── yolo.ts         # ONNX Runtime Web inference (download, preprocess, postprocess)
│   │       ├── supabase-browser.ts  # Supabase browser client (Google SSO)
│   │       └── supabase-server.ts   # Supabase server client (middleware, route handlers)
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

## Inventory & Rooms API

All inventory and room endpoints require authentication. Send the Supabase
access token in the `Authorization` header:

```
Authorization: Bearer <supabase_access_token>
```

### `POST /rooms`

Creates a new room for the authenticated user.

**Request (JSON):**
```json
{
  "name": "Room A"
}
```

**Response (201):**
```json
{
  "id": "a1b2c3d4-...",
  "name": "Room A",
  "created_at": "2026-08-02T12:00:00Z"
}
```

### `GET /rooms`

Lists all rooms owned by the authenticated user.

**Response:**
```json
[
  {
    "id": "a1b2c3d4-...",
    "name": "Room A",
    "created_at": "2026-08-02T12:00:00Z"
  }
]
```

### `PUT /rooms/{room_id}`

Renames a room. Inventory items referencing the room have their `room_name`
snapshot updated automatically.

**Request (JSON):**
```json
{
  "name": "Conference Room"
}
```

**Response:**
```json
{
  "id": "a1b2c3d4-...",
  "name": "Conference Room",
  "created_at": "2026-08-02T12:00:00Z"
}
```

### `DELETE /rooms/{room_id}`

Deletes a room. Inventory items referencing it keep their `room_name` snapshot
but have their `room_id` set to `NULL`.

### `POST /inventory`

Bulk-saves detected assets into the authenticated user's inventory. Each item
records the owner ID, creating time, room, and image ID.

**Request (JSON):**
```json
{
  "items": [
    {
      "name": "Chair",
      "room_id": "a1b2c3d4-...",
      "image_id": "b2c3d4e5-...",
      "image_url": "https://your-project.supabase.co/storage/v1/object/public/images/detected_20260729_132116_f150d6bf.jpg",
      "confidence": 0.95,
      "bbox": [100, 200, 300, 400]
    }
  ]
}
```

**Response (201):**
```json
[
  {
    "id": "c3d4e5f6-...",
    "owner_id": "a1b2c3d4-...",
    "name": "Chair",
    "room_id": "a1b2c3d4-...",
    "room_name": "Room A",
    "image_id": "b2c3d4e5-...",
    "image_url": "https://your-project.supabase.co/storage/v1/object/public/images/detected_20260729_132116_f150d6bf.jpg",
    "confidence": 0.95,
    "bbox": [100, 200, 300, 400],
    "created_at": "2026-08-02T12:00:00Z"
  }
]
```

### `GET /inventory`

Lists all inventory items owned by the authenticated user.

**Response:**
```json
[
  {
    "id": "c3d4e5f6-...",
    "owner_id": "a1b2c3d4-...",
    "name": "Chair",
    "room_id": "a1b2c3d4-...",
    "room_name": "Room A",
    "image_id": "b2c3d4e5-...",
    "image_url": "https://your-project.supabase.co/storage/v1/object/public/images/detected_20260729_132116_f150d6bf.jpg",
    "confidence": 0.95,
    "bbox": [100, 200, 300, 400],
    "created_at": "2026-08-02T12:00:00Z"
  }
]
```

### `DELETE /inventory/{item_id}`

Removes an inventory item owned by the authenticated user.

### `GET /scans`

Lists the scan-history records owned by the authenticated user. A scan record is
created each time assets are saved to the inventory, showing the saved asset
names, how many assets, which room they were assigned to, and the date/time.

**Headers:**
```
Authorization: Bearer <supabase_access_token>
```

**Response:**
```json
[
  {
    "id": "f5e6d7c8-...",
    "image_id": "b2c3d4e5-...",
    "image_url": "https://your-project.supabase.co/storage/v1/object/public/images/detected_20260729_132116_f150d6bf.jpg",
    "room_id": "a1b2c3d4-...",
    "room_name": "Room A",
    "asset_count": 3,
    "assets": ["Chair 1", "Chair 2", "Desk 1"],
    "created_at": "2026-08-02T12:00:00Z"
  }
]
```

### `PUT /scans/{scan_id}`

Changes a scan's date. The inventory items from that scan (sharing the same
`image_id` and owner) are also moved to the new date, so the per-date summary
stays consistent with the scan history.

**Headers:**
```
Authorization: Bearer <supabase_access_token>
```

**Request (JSON):**
```json
{
  "date": "2026-08-03"
}
```

**Response:**
```json
{
  "id": "f5e6d7c8-...",
  "image_id": "b2c3d4e5-...",
  "image_url": "https://your-project.supabase.co/storage/v1/object/public/images/detected_20260729_132116_f150d6bf.jpg",
  "room_id": "a1b2c3d4-...",
  "room_name": "Room A",
  "asset_count": 3,
  "assets": ["Chair 1", "Chair 2", "Desk 1"],
  "created_at": "2026-08-03T12:00:00Z"
}
```

## Authentication (Google SSO)

This project uses **Supabase Auth** for Google Single Sign-On. The OAuth flow
works as follows:

1. The user clicks "Sign in with Google" on the `/login` page.
2. Supabase Auth handles the Google OAuth redirect and returns to
   `/auth/callback?code=...&next=...`.
3. The callback route exchanges the code for a session, then calls
   `POST /auth/google` on the backend to sync the user's **Profile** in
   PostgreSQL.
4. The user is redirected to the `next` destination (defaults to `/`).

### Redirect Logic

| Scenario | Behavior |
|----------|----------|
| User clicks Login on landing page | → `/login` |
| User logs in via `/login` | → `/` (main page) |
| User hits a protected page without login | → `/login?next=<page>` |
| User logs in after being redirected | → back to `<page>` |
| Already logged in visits `/login` | → `/` (or `next`) |

### Profile Model

The `Profile` table (in `backend/auth/models.py`) stores:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID (PK) | Unique user ID (`uuid.uuid4`) |
| `email` | String | Unique, indexed |
| `name` | String | Display name from Google |
| `avatar_url` | String (nullable) | Google profile picture URL |
| `role` | String | `"user"` (default) or `"admin"` |
| `created_at` | DateTime | Auto-set on creation |
| `updated_at` | DateTime | Auto-updated on change |

New users default to the `"user"` role. To promote a user to `"admin"`,
update the `role` column directly in PostgreSQL.

### Auth API Endpoints

#### `POST /auth/google`

Verifies a Supabase access token and upserts the user's Profile.

**Request (JSON):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**
```json
{
  "profile": {
    "id": "a1b2c3d4-...",
    "email": "user@example.com",
    "name": "John Doe",
    "avatar_url": "https://lh3.googleusercontent.com/...",
    "role": "user",
    "created_at": "2026-08-02T12:00:00Z",
    "updated_at": "2026-08-02T12:00:00Z"
  }
}
```

#### `GET /auth/me`

Returns the currently authenticated user's profile.

**Headers:**
```
Authorization: Bearer <supabase_access_token>
```

**Response:**
```json
{
  "id": "a1b2c3d4-...",
  "email": "user@example.com",
  "name": "John Doe",
  "avatar_url": "https://lh3.googleusercontent.com/...",
  "role": "user",
  "created_at": "2026-08-02T12:00:00Z",
  "updated_at": "2026-08-02T12:00:00Z"
}
```

#### `PUT /auth/me`

Updates the authenticated user's profile name.

**Headers:**
```
Authorization: Bearer <supabase_access_token>
```

**Request (JSON):**
```json
{
  "name": "New Display Name"
}
```

**Response:**
```json
{
  "id": "a1b2c3d4-...",
  "email": "user@example.com",
  "name": "New Display Name",
  "avatar_url": "https://lh3.googleusercontent.com/...",
  "role": "user",
  "created_at": "2026-08-02T12:00:00Z",
  "updated_at": "2026-08-02T12:30:00Z"
}
```

### Supabase Auth Setup

1. Go to **Supabase Dashboard → Authentication → Providers**.
2. Enable **Google** and add your Google OAuth Client ID and Secret
   (from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)).
3. Add your site URL (e.g. `http://localhost:3000` and your Vercel URL) to
   **Authentication → URL Configuration → Site URL**.
4. Add `http://localhost:3000/auth/callback` and
   `https://your-vercel-url.vercel.app/auth/callback` to the **Redirect URLs**.

### Frontend Dependencies

The frontend requires the Supabase SSR packages:

```bash
cd frontend
npm install @supabase/supabase-js @supabase/ssr
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

# PostgreSQL Database (Supabase Postgres)
# IMPORTANT: Use the connection pooler (port 6543) for Render/Vercel deployments.
# The direct connection (port 5432) uses IPv6 which Render's free tier does not support.
# Get this from Supabase Dashboard → Project Settings → Database → Connection string → Transaction pooler
# Format: postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres

# Supabase JWT Secret (for verifying Supabase Auth tokens)
# Get this from Supabase Dashboard → Project Settings → API → JWT Secret
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

And in the `frontend/` directory (or project root) for the frontend:

```
# Backend API URL (use the Render URL for production, or http://localhost:8000 for local dev)
NEXT_PUBLIC_API_URL=https://smart-office-asset-management-ai.onrender.com

# Supabase Auth (Google SSO) — these are safe to expose (anon key, not service_role)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
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
| `DATABASE_URL` | — | PostgreSQL connection string (Supabase Postgres). Use the **connection pooler** (port 6543) for Render/Vercel: `postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres` |
| `SUPABASE_JWT_SECRET` | — | Supabase JWT secret for verifying auth tokens (Dashboard → Settings → API → JWT Secret) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API base URL |
| `NEXT_PUBLIC_ONNX_MODEL_URL` | `<NEXT_PUBLIC_API_URL>/detects/model` | Optional direct URL to the `best.onnx` model downloaded by the browser (defaults to the backend proxy) |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Supabase project URL for frontend auth (same as `SUPABASE_URL`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Supabase anon key for frontend auth (safe to expose, NOT the service_role key) |
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