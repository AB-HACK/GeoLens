# GeoLens V1

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
