# Smart Pantry AI

AI-powered pantry management system that uses computer vision to identify food items, track expiration dates, and suggest recipes.

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, PostgreSQL
- **Frontend**: Next.js, TypeScript, TailwindCSS
- **AI**: YOLO 26 for object detection

## Features

- **Smart Scanning** - Upload images and detect food items using YOLO model
- Expiration date tracking and notifications
- Recipe suggestions based on available ingredients
- Waste reduction analytics

## Getting Started

### Activate Backend
```bash
python -m venv pantry
pantry\Scripts\activate
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```
Or run from project root:
```bash
uvicorn backend.main:app --reload
```

## Project Structure

- `frontend/` - Next.js frontend application
  - `app/page.tsx` - Main landing page with light purple theme
  - `app/scans/page.tsx` - Image upload and detection page
  - `app/detects/` - Detection routes
- `backend/` - FastAPI backend server
- `uploads/` - Directory for uploaded images

## Environment Variables

Create a `.env` file in the project root with:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
YOLO_MODEL_PATH=models/yolo26n.pt
DEVICE=cuda
```

## GPU/CUDA Support

The detection service automatically detects and uses CUDA GPU if available. If CUDA is not available, it falls back to CPU. When the service initializes, it logs:
- Which GPU is being used (if CUDA is available)
- Whether CPU or CUDA is being used for inference
- The model path being loaded

Make sure you have:
- NVIDIA GPU with CUDA support
- PyTorch with CUDA support installed
- Properly configured CUDA environment variables

### Model Information

**Model Used:** YOLO-26 Nano (`models/yolo26n.pt`)
- Custom YOLO model trained on food items
- Detects various food and pantry items
- Model path must exist, otherwise the service will raise an error

If you need to use a different model, update the `YOLO_MODEL_PATH` environment variable.

### Verifying CUDA

To verify CUDA is working:
```python
import torch
print(torch.cuda.is_available())  # Should return True
print(torch.cuda.get_device_name(0))  # Shows GPU name (e.g., 'NVIDIA RTX 3080')
```
