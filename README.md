# Smart Office Asset Management AI

AI-powered office asset management system that uses computer vision to identify office equipment, track maintenance schedules, and manage inventory.

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, PostgreSQL
- **Frontend**: Next.js, TypeScript, TailwindCSS
- **AI**: YOLO (Ultralytics) for office asset detection

## Features

- **Smart Asset Scanning** - Upload images and detect office assets (Desk, Chair, Computer monitor) using YOLO models
- **Multi-Model Support** - Switch between different YOLO models directly from the UI
- **Maintenance scheduling and notifications** - Never miss equipment maintenance
- **Asset documentation and insights** - Discover asset documentation and usage insights

## Getting Started
### Activate Backend
```bash
python -m venv office
office\Scripts\activate
```
### Backend Setup

```bash
cd backend
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
├── backend/                    # FastAPI backend server
│   ├── main.py                 # FastAPI application entry point
│   ├── requirements.txt        # Python dependencies
│   ├── .env                    # Environment variables
│   ├── assets/
│   │   ├── router.py           # Detection API routes (/detects/*)
│   │   └── service.py          # YOLO model inference service
│   ├── models/                 # YOLO model files (.pt)
│   │   ├── best.pt             # Default trained model
│   │   ├── yolo26n.pt          # YOLO26 nano model
│   │   ├── yolo26l.pt          # YOLO26 large model
│   │   ├── yolo26x.pt          # YOLO26 x-large model
│   │   └── ...                 # Additional trained models
│   └── uploads/                # Uploaded and detected images
├── frontend/                   # Next.js frontend application
│   ├── app/
│   │   ├── page.tsx            # Main landing page with purple theme
│   │   ├── layout.tsx          # Root layout
│   │   ├── globals.css         # Global styles
│   │   └── scans/
│   │       └── page.tsx        # Image upload and detection page
│   └── package.json            # Node.js dependencies
├── Test_Images/                # Sample test images for development
└── README.md
```

## API Endpoints

### `GET /detects/models`
List all available YOLO models in the models directory.

**Response:**
```json
{
  "models": [
    {
      "name": "best.pt",
      "path": "models/best.pt",
      "size": 12345678
    }
  ]
}
```

### `POST /detects/detect`
Detect office assets in an uploaded image.

**Request:**
- `file` (multipart/form-data) - Image file to analyze
- `model_path` (optional form field) - Specific model to use for detection

**Response:**
```json
{
  "image_url": "/uploads/detected_20260729_132116_f150d6bf.jpg",
  "detections": [
    {
      "id": 0,
      "label": "Chair",
      "confidence": 0.95,
      "bbox": [100.5, 200.3, 300.7, 400.2]
    }
  ],
  "model_info": {
    "model_path": "models/best.pt",
    "device": "cuda"
  }
}
```

## Environment Variables

Create a `.env` file in the `backend/` directory with:

```
MODEL_PATH=models/best.pt
UPLOAD_DIR=uploads
HOST=0.0.0.0
PORT=8000
DEVICE=cuda
```

And in the project root for the frontend:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Environment Variable Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_PATH` | `models/best.pt` | Default YOLO model file path |
| `UPLOAD_DIR` | `uploads` | Directory for uploaded images |
| `HOST` | `0.0.0.0` | Backend server host |
| `PORT` | `8000` | Backend server port |
| `DEVICE` | `cuda` | Inference device (`cuda` or `cpu`) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Frontend API base URL |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed CORS origins (comma-separated) |

## GPU/CUDA Support

The detection service automatically detects and uses CUDA GPU if available. If CUDA is not available, it falls back to CPU. When the service initializes, it logs:
- Which GPU is being used (if CUDA is available)
- Whether CPU or CUDA is being used for inference
- The model path being loaded

Make sure you have:
- NVIDIA GPU with CUDA support
- PyTorch with CUDA support installed
- Properly configured CUDA environment variables

### Verifying CUDA

To verify CUDA is working:
```python
import torch
print(torch.cuda.is_available())  # Should return True
print(torch.cuda.get_device_name(0))  # Shows GPU name (e.g., 'NVIDIA RTX 3080')
```

## Model Information

### Detection Classes

The system is trained to detect the following office asset classes:
- **Desk** - Office desks and workstations
- **Chair** - Office chairs and seating
- **Computer monitor** - Monitors and displays

### Available Models

The `backend/models/` directory contains multiple YOLO model variants:
- `best.pt` - Default trained model (loaded when `MODEL_PATH` is not specified)
- `yolo26n.pt` - YOLO26 nano (fastest, smallest)
- `yolo26l.pt` - YOLO26 large (balanced)
- `yolo26x.pt` - YOLO26 x-large (most accurate, largest)
- Additional custom-trained models

You can switch between models at runtime using the model selector in the frontend UI or by passing the `model_path` parameter to the `/detects/detect` API endpoint.

### Model Caching

The detection service caches loaded models in memory. If a model is already loaded, subsequent requests using the same model will reuse the cached instance. Switching to a different model will load it on demand.

## Frontend Features

- **Image Upload** - Drag-and-drop or click to upload images for analysis
- **Model Selection** - Choose from available YOLO models via a dropdown selector
- **Real-time Detection** - View detection results with confidence scores
- **Annotated Images** - See bounding boxes drawn on detected objects
- **Model Info Display** - View which model and device (CPU/GPU) was used for inference
- **Responsive Design** - Purple-themed UI built with TailwindCSS

## Development

### Adding New Models

1. Place your trained `.pt` model file in the `backend/models/` directory
2. The model will automatically appear in the frontend model selector
3. Set it as default by updating `MODEL_PATH` in `backend/.env`

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
4. Save the trained weights to `backend/models/` and update `MODEL_PATH`