# Smart Office Asset Management AI

AI-powered office asset management system that uses computer vision to identify office equipment, track maintenance schedules, and manage inventory.

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, PostgreSQL
- **Frontend**: Next.js, TypeScript, TailwindCSS
- **AI**: YOLO for office asset detection

## Features

- **Smart Asset Scanning** - Upload images and detect office assets using YOLO model
- Maintenance scheduling and notifications
- Asset documentation and insights

## Getting Started

### Activate Backend
```bash
python -m venv office
office\Scripts\activate
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
  - `assets/` - Asset detection routes and service
- `uploads/` - Directory for uploaded images
- `HomeObjects/` - HomeObjects-3K training module
  - `train_homeobjects.py` - Training script for office asset detection model
  - `train_homeobjects.ipynb` - Jupyter notebook for training the model
  - `HomeObjects-3K.yaml` - Dataset configuration file

## Environment Variables

Create a `.env` file in the project root with:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
YOLO_MODEL_PATH=models/yolo26n.pt
DEVICE=cuda
```

**Note:** The `models/yolo26n.pt` model may need to be re-downloaded or trained if incompatible. The system will automatically fall back to `yolov8n.pt` if the model fails to load.

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

**Model Used:** YOLOv8 Nano (pretrained) or custom office asset model (`models/yolo26n.pt`)
- Detects office equipment, furniture, and electronics using pretrained model
- Can be customized with your trained model by updating `YOLO_MODEL_PATH`

If you train a custom model using the HomeObjects-3K training module, update the `YOLO_MODEL_PATH` environment variable to point to your trained model.

### Verifying CUDA

To verify CUDA is working:
```python
import torch
print(torch.cuda.is_available())  # Should return True
print(torch.cuda.get_device_name(0))  # Shows GPU name (e.g., 'NVIDIA RTX 3080')
```

## HomeObjects-3K Training

The HomeObjects-3K module provides a training pipeline for custom YOLO models to detect office assets and equipment.

### Dataset Classes

The HomeObjects-3K dataset includes 12 classes perfect for office asset management:
- bed, sofa, chair, table, lamp, tv (furniture)
- laptop, wardrobe, window, door (office fixtures)
- potted plant, photo frame (office decorations)

### Training the Model

To train a custom YOLO model on the HomeObjects-3K dataset:

```bash
# Navigate to the HomeObjects directory
cd HomeObjects

# Install additional requirements for training
pip install ultralytics jupyter

# Run the training notebook
jupyter notebook train_homeobjects.ipynb
```

Or run the training script directly:
```bash
python train_homeobjects.py
```

### Training Configuration

You can adjust the following parameters in `TrainingConfig`:
- `epochs`: Number of training epochs (default: 100)
- `batch_size`: Batch size for training (default: 16)
- `img_size`: Image size for training (default: 640)
- `model_name`: Output model name (default: "office-assets-trained")
- `device`: Training device - "cuda" or "cpu" (default: "cuda")
- `patience`: Early stopping patience (default: 20)
- `workers`: Number of data loader workers (default: 4)

### Using Trained Models

After training, the model weights are saved to `runs/train/office-assets-trained/weights/best.pt`. You can integrate these weights into your office asset detection service by updating the YOLO_MODEL_PATH environment variable.
