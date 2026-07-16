# Smart Pantry AI

AI-powered pantry management system that uses computer vision to identify food items, track expiration dates, and suggest recipes.

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, PostgreSQL
- **Frontend**: Next.js, TypeScript, TailwindCSS
- **AI**: YOLO 26 for object detection

## Features

- Smart scanning of pantry items using AI
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

## Project Structure

- `frontend/` - Next.js frontend application
  - `app/page.tsx` - Main landing page with light purple theme
  - `app/detects/` - Detection routes
- `backend/` - FastAPI backend server
- `uploads/` - Directory for uploaded images