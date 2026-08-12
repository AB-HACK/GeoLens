import json
import os
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from geoclip import GeoCLIP
from sqlalchemy import Column, DateTime, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "geolens.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

executor = ThreadPoolExecutor(max_workers=2)
job_store: Dict[str, Dict[str, Any]] = {}
job_lock = threading.Lock()

OPENWEATHER_KEY = os.environ.get("OPENWEATHERMAP_API_KEY", "")
NOMINATIM_BASE = "https://nominatim.openstreetmap.org/reverse"
WEATHER_BASE = "https://api.openweathermap.org/data/2.5/weather"

app = FastAPI(title="GeoLens Inference API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class JobRecord(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, index=True)
    status = Column(String, nullable=False, default="pending")
    result = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)


def save_job_record(job_id: str, status: str, result: Optional[Dict[str, Any]] = None) -> None:
    with SessionLocal() as session:
        record = session.get(JobRecord, job_id)
        if record is None:
            record = JobRecord(id=job_id, status=status, result=json.dumps(result) if result else None)
            session.add(record)
        else:
            record.status = status
            record.result = json.dumps(result) if result else record.result
            record.updated_at = datetime.utcnow()
        session.commit()


def get_job_record(job_id: str) -> Optional[Dict[str, Any]]:
    with SessionLocal() as session:
        record = session.get(JobRecord, job_id)
        if not record:
            return None
        return {
            "id": record.id,
            "status": record.status,
            "result": json.loads(record.result) if record.result else None,
            "created_at": record.created_at.isoformat(),
            "updated_at": record.updated_at.isoformat(),
        }


def build_location_label(lat: float, lon: float) -> str:
    try:
        response = httpx.get(
            NOMINATIM_BASE,
            params={
                "format": "jsonv2",
                "lat": lat,
                "lon": lon,
                "zoom": 10,
                "addressdetails": 1,
            },
            headers={"User-Agent": "GeoLens/1.0 (+https://example.com)"},
            timeout=12,
        )
        response.raise_for_status()
        data = response.json()
        address = data.get("address", {})
        city = address.get("city") or address.get("town") or address.get("village") or address.get("county")
        country = address.get("country")
        if city and country:
            return f"{city}, {country}"
        if country:
            return f"{country}"
        return f"{lat:.4f}, {lon:.4f}"
    except Exception:
        return f"{lat:.4f}, {lon:.4f}"


def fetch_weather(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    if not OPENWEATHER_KEY:
        return None
    try:
        response = httpx.get(
            WEATHER_BASE,
            params={
                "lat": lat,
                "lon": lon,
                "units": "metric",
                "appid": OPENWEATHER_KEY,
            },
            timeout=12,
        )
        response.raise_for_status()
        data = response.json()
        weather = data.get("weather", [{}])[0]
        main = data.get("main", {})
        return {
            "description": weather.get("description", "Unknown").title(),
            "temperature": main.get("temp"),
            "feels_like": main.get("feels_like"),
            "humidity": main.get("humidity"),
        }
    except Exception:
        return None


def build_prediction_result(image_bytes: bytes) -> Dict[str, Any]:
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp.write(image_bytes)
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
        label = build_location_label(lat, lon)
        candidates.append(
            {
                "rank": rank,
                "latitude": float(lat),
                "longitude": float(lon),
                "label": label,
                "confidence": float(confidence),
            }
        )

    top = candidates[0]
    weather = fetch_weather(top["latitude"], top["longitude"])

    return {
        "status": "completed",
        "top_prediction": top,
        "alternatives": candidates[1:],
        "current_weather": weather,
        "meta": {
            "model_confidence": float(top["confidence"]),
            "estimated": True,
        },
    }


def complete_job(job_id: str, image_bytes: bytes) -> None:
    result = build_prediction_result(image_bytes)
    with job_lock:
        job_store[job_id] = {"status": "completed", "result": result}
    save_job_record(job_id, "completed", result)


@app.on_event("startup")
async def startup_event() -> None:
    app.state.model = GeoCLIP()


@app.post("/predict")
def predict(background_tasks: BackgroundTasks, file: UploadFile = File(...)) -> Dict[str, Any]:
    contents = file.file.read()
    job_id = str(uuid.uuid4())
    future = executor.submit(build_prediction_result, contents)

    try:
        result = future.result(timeout=8)
        save_job_record(job_id, "completed", result)
        return result
    except TimeoutError:
        with job_lock:
            job_store[job_id] = {"status": "pending", "result": None}
        save_job_record(job_id, "pending")
        background_tasks.add_task(complete_job, job_id, contents)
        return {"status": "pending", "job_id": job_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> Dict[str, Any]:
    with job_lock:
        job = job_store.get(job_id)
    record = get_job_record(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job and job.get("status") == "completed":
        return {"status": "completed", **job["result"]}
    if record["status"] == "completed" and record["result"]:
        return {"status": "completed", **record["result"]}
    return {"status": "pending"}


@app.get("/")
def root() -> Dict[str, str]:
    return {"message": "GeoLens inference service is running"}
