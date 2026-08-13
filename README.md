# GeoLens V2 - Explainability Edition

**Upgraded from V1!** GeoLens now includes explainability features. Instead of just showing a prediction, the app now displays the **why** behind each guess using Google Cloud Vision API and Roboflow object detection.

👉 **[See V2 Documentation](./V2_EXPLAINABILITY.md)** for setup instructions and feature details.

---

## V2 Features

- 🔍 **Landmark Detection** - Recognize geographical landmarks with confidence scores
- 🏷️ **Scene Labels** - Detect geography-relevant features (terrain, architecture, vegetation, climate)
- 📝 **Text Detection (OCR)** - Extract text from images for language/signage context
- 🎯 **Object Detection** - Identify vehicles, road signs, and infrastructure with bounding boxes
- 📊 **Evidence-Adjusted Ranking** - See how detected evidence re-ranks the top predictions
- 🔄 **Prediction Comparison** - View GeoCLIP-only vs. evidence-adjusted side-by-side

## Quick Start

```bash
# Install dependencies
npm install
cd fastapi_app && pip install -r requirements.txt && cd ..

# Set environment variables (see V2_EXPLAINABILITY.md)
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
export ROBOFLOW_API_KEY="your_key"

# Start backend
cd fastapi_app && uvicorn main:app --reload --port 8000 &

# Start frontend
npm run dev
```

Open http://localhost:3000

---

# Original GeoLens V1

A visual geolocation web app built with Next.js and FastAPI. Upload a photo and GeoLens predicts likely locations using GeoCLIP, shows an interactive map with the top candidates, and displays current weather at the estimated location.

## Project structure

- `app/` — Next.js App Router frontend
- `fastapi_app/` — Python inference service
- `.venv/` — local Python virtual environment

## Local setup

1. Install Node dependencies:
   ```bash
   cd GeoLens
   npm install
   ```

2. Activate the Python virtual environment:
   ```bash
   cd GeoLens
   .venv\Scripts\activate
   python -m pip install --upgrade pip setuptools wheel
   python -m pip install -r fastapi_app/requirements.txt
   ```

3. Start the FastAPI service:
   ```bash
   cd GeoLens
   .venv\Scripts\activate
   uvicorn fastapi_app.main:app --reload --host 0.0.0.0 --port 8000
   ```

4. Start the Next.js frontend:
   ```bash
   npm run dev
   ```

5. Visit `http://localhost:3000` and upload an image.

## Notes

- The inference service uses the GeoCLIP package and runs model inference synchronously for up to 8 seconds.
- If inference takes longer, it returns a job ID and the frontend polls the service.
- Reverse geocoding uses Nominatim and current weather uses OpenWeatherMap.
- No authentication is included in V1.
