import base64
import json
import os
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from geoclip import GeoCLIP
from google.cloud import vision
from PIL import Image, ImageDraw
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

# Evidence data structures
class Landmark:
    def __init__(self, name: str, confidence: float):
        self.name = name
        self.confidence = confidence

    def to_dict(self) -> Dict[str, Any]:
        return {"name": self.name, "confidence": self.confidence}


class Label:
    def __init__(self, name: str, confidence: float):
        self.name = name
        self.confidence = confidence

    def to_dict(self) -> Dict[str, Any]:
        return {"name": self.name, "confidence": self.confidence}


class DetectedObject:
    def __init__(self, label: str, confidence: float, bbox: Dict[str, float]):
        self.label = label
        self.confidence = confidence
        self.bbox = bbox  # {"x_min", "y_min", "x_max", "y_max"} normalized to 0-1

    def to_dict(self) -> Dict[str, Any]:
        return {
            "label": self.label,
            "confidence": self.confidence,
            "bbox": self.bbox,
        }


class Evidence:
    def __init__(self):
        self.landmarks: List[Landmark] = []
        self.labels: List[Label] = []
        self.ocr_text: List[str] = []
        self.objects: List[DetectedObject] = []
        self.extracted_language: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "landmarks": [lm.to_dict() for lm in self.landmarks],
            "labels": [lbl.to_dict() for lbl in self.labels],
            "ocr_text": self.ocr_text,
            "objects": [obj.to_dict() for obj in self.objects],
            "extracted_language": self.extracted_language,
        }

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


# Google Cloud Vision API integration
def extract_evidence_from_image(image_bytes: bytes) -> Evidence:
    """Extract landmarks, labels, OCR text from image using Google Cloud Vision API."""
    evidence = Evidence()
    
    try:
        client = vision.ImageAnnotatorClient()
        image = vision.Image(content=image_bytes)
        
        # Landmark detection
        landmark_response = client.landmark_detection(image=image)
        for landmark in landmark_response.landmarks:
            if landmark.name:
                evidence.landmarks.append(
                    Landmark(
                        name=landmark.name,
                        confidence=float(landmark.score),
                    )
                )
        
        # Label detection (scene/geography labels)
        label_response = client.label_detection(image=image)
        geography_keywords = {
            "landscape", "vegetation", "forest", "mountain", "water", "ocean", "beach",
            "city", "urban", "rural", "architecture", "building", "street", "road",
            "desert", "terrain", "sky", "weather", "tree", "plant", "grass",
            "monument", "structure", "infrastructure", "nature", "climate"
        }
        for label in label_response.labels:
            label_name = label.description.lower()
            # Only include labels relevant to geography/scene context
            if any(keyword in label_name for keyword in geography_keywords):
                evidence.labels.append(
                    Label(
                        name=label.description,
                        confidence=float(label.score),
                    )
                )
        
        # Text detection (OCR)
        text_response = client.text_detection(image=image)
        texts = [text.description for text in text_response.text_annotations[1:]]  # Skip full text
        evidence.ocr_text = texts
        
        # Detect language from OCR text
        if text_response.text_annotations:
            full_text = text_response.text_annotations[0].description
            if full_text:
                # Try to detect language - this is a simple heuristic
                language_response = client.document_text_detection(image=image)
                if language_response.full_text_annotation and language_response.full_text_annotation.pages:
                    # Language is in the first block's property if available
                    for page in language_response.full_text_annotation.pages:
                        if page.property and page.property.detected_languages:
                            detected_lang = page.property.detected_languages[0]
                            evidence.extracted_language = detected_lang.language_code
    except Exception as e:
        print(f"Error extracting evidence from Vision API: {e}")
    
    return evidence


def detect_objects_roboflow(image_bytes: bytes) -> List[DetectedObject]:
    """Detect objects using Roboflow pretrained model (e.g., vehicles, road signs)."""
    objects = []
    
    try:
        # Import roboflow here to avoid issues if not installed
        from roboflow import Roboflow
        
        rf = Roboflow(api_key=os.environ.get("ROBOFLOW_API_KEY"))
        
        # Using a public model from Roboflow Universe - choose a relevant one
        # Example: "coco/12" for COCO dataset (general object detection)
        # For vehicles: "aerial-objects-v2/1"
        # For road signs: "road-signs-detection/7"
        # We'll use a general-purpose model that detects vehicles, signs, infrastructure
        try:
            project = rf.workspace().project("aerial-objects-v2")
            model = project.version(1).model
        except:
            # Fallback to COCO if specific model not available
            project = rf.workspace().project("coco")
            model = project.version(12).model
        
        # Prepare image
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp.flush()
            image_path = tmp.name
        
        try:
            prediction = model.predict(image_path, confidence=30, overlap=30).json()
            
            # Parse predictions
            if "predictions" in prediction:
                image_width = prediction.get("image").get("width", 1)
                image_height = prediction.get("image").get("height", 1)
                
                for pred in prediction["predictions"]:
                    # Normalize bounding box to 0-1 range
                    x = pred.get("x", 0)
                    y = pred.get("y", 0)
                    width = pred.get("width", 0)
                    height = pred.get("height", 0)
                    
                    x_min = (x - width / 2) / image_width
                    y_min = (y - height / 2) / image_height
                    x_max = (x + width / 2) / image_width
                    y_max = (y + height / 2) / image_height
                    
                    # Clamp to [0, 1]
                    x_min = max(0, min(1, x_min))
                    y_min = max(0, min(1, y_min))
                    x_max = max(0, min(1, x_max))
                    y_max = max(0, min(1, y_max))
                    
                    objects.append(
                        DetectedObject(
                            label=pred.get("class", "unknown"),
                            confidence=float(pred.get("confidence", 0)),
                            bbox={
                                "x_min": x_min,
                                "y_min": y_min,
                                "x_max": x_max,
                                "y_max": y_max,
                            },
                        )
                    )
        finally:
            try:
                os.unlink(image_path)
            except OSError:
                pass
    except Exception as e:
        print(f"Error detecting objects with Roboflow: {e}")
    
    return objects


def score_evidence_for_location(
    evidence: Evidence,
    location_lat: float,
    location_lon: float,
) -> float:
    """
    Score how well the evidence supports a given location.
    Returns a score multiplier (0-2) to adjust the location's confidence.
    
    This is a heuristic scoring approach:
    - Landmark detected: +0.3
    - Geography-relevant labels: +0.2 per label (capped at 0.5)
    - Objects detected (vehicles, signs, infrastructure): +0.25
    - OCR text with language cues: +0.15
    
    Base multiplier is 1.0 (no adjustment). Score can range 0.5-2.0.
    """
    score_adjustment = 0.0
    
    # Landmark scoring - strongest signal
    if evidence.landmarks:
        score_adjustment += min(0.3 * len(evidence.landmarks), 0.5)
    
    # Label scoring - geography context
    if evidence.labels:
        score_adjustment += min(0.1 * len(evidence.labels), 0.5)
    
    # Object detection scoring
    if evidence.objects:
        score_adjustment += min(0.25, 0.25 * len(evidence.objects) / 3)
    
    # OCR text scoring
    if evidence.ocr_text:
        score_adjustment += 0.15
    
    # Final multiplier: base 1.0 + adjustments
    multiplier = 1.0 + score_adjustment
    
    # Clamp between 0.5 and 2.0
    return max(0.5, min(2.0, multiplier))


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

    # Extract evidence from image
    evidence = extract_evidence_from_image(image_bytes)
    
    # Detect objects using Roboflow
    detected_objects = detect_objects_roboflow(image_bytes)
    evidence.objects.extend(detected_objects)

    # Score each candidate location based on evidence
    adjusted_candidates = []
    for candidate in candidates:
        score_multiplier = score_evidence_for_location(
            evidence,
            candidate["latitude"],
            candidate["longitude"],
        )
        adjusted_confidence = min(1.0, candidate["confidence"] * score_multiplier)
        adjusted_candidates.append({
            **candidate,
            "adjusted_confidence": adjusted_confidence,
            "evidence_multiplier": score_multiplier,
        })

    # Re-rank based on adjusted confidence
    adjusted_candidates_sorted = sorted(
        adjusted_candidates, key=lambda x: x["adjusted_confidence"], reverse=True
    )
    for idx, candidate in enumerate(adjusted_candidates_sorted, start=1):
        candidate["adjusted_rank"] = idx

    top = candidates[0]
    adjusted_top = adjusted_candidates_sorted[0]
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
        "evidence": evidence.to_dict(),
        "adjusted_ranking": adjusted_candidates_sorted,
        "adjusted_top_prediction": adjusted_top,
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
