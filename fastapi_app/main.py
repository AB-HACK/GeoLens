import os
import tempfile
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from geoclip import GeoCLIP

BASE_DIR = Path(__file__).resolve().parent

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

app = FastAPI(title="GeoLens ML Service", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event() -> None:
    app.state.model = GeoCLIP()
    print("GeoCLIP model loaded")


@app.post("/predict")
def predict(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    GeoCLIP inference endpoint.
    Takes an image and returns top-5 location predictions with confidence scores.
    """
    try:
        contents = file.file.read()
        
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(contents)
            tmp.flush()
            image_path = tmp.name

        try:
            top_pred_gps, top_pred_prob = app.state.model.predict(image_path, top_k=5)
        finally:
            try:
                os.unlink(image_path)
            except OSError:
                pass

        candidates = []
        for rank, ((lat, lon), confidence) in enumerate(zip(top_pred_gps, top_pred_prob), start=1):
            candidates.append(
                {
                    "rank": rank,
                    "latitude": float(lat),
                    "longitude": float(lon),
                    "confidence": float(confidence),
                }
            )

        return {
            "status": "success",
            "top_prediction": candidates[0],
            "alternatives": candidates[1:],
            "meta": {
                "model": "geoclip",
                "version": "1.0",
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@app.get("/health")
def health_check() -> Dict[str, str]:
    """Health check endpoint for orchestration service."""
    return {"status": "healthy", "service": "geoclip-ml"}


@app.get("/")
def root() -> Dict[str, str]:
    return {"message": "GeoLens ML Service v3 - GeoCLIP Inference Only"}
