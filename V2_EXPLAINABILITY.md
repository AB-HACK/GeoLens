# GeoLens V2 - Explainability Version

GeoLens V2 extends the original GeoCLIP-based geolocation prediction with explainability features. The app now shows **why** it makes a prediction by integrating evidence from Google Cloud Vision API and Roboflow object detection.

## What's New in V2

### Evidence-Based Explainability
Instead of just showing a prediction with a confidence score, GeoLens V2 now displays:

1. **Landmarks Detected** - Recognized geographical landmarks with confidence scores (powered by Google Cloud Vision)
2. **Scene Labels** - Geography-relevant labels (vegetation type, architecture style, terrain, climate) 
3. **Text Detection (OCR)** - Any text detected in the image (useful for language and signage cues)
4. **Object Detection** - Vehicles, road signs, and infrastructure detected in the image with bounding boxes (powered by Roboflow)

### Evidence-Adjusted Ranking
The app combines detected evidence with the GeoCLIP model's top-5 predictions using a heuristic scoring approach:

- Landmarks detected: **+0.30x multiplier**
- Scene labels: **+0.10x per label** (capped at 0.50x)
- Objects detected: **+0.25x** (infrastructure, vehicles, signs)
- OCR text found: **+0.15x**

The adjusted confidence scores are used to re-rank the predictions, and you can see the before/after comparison in the "Prediction Comparison" tab.

### Prediction Comparison View
See side-by-side comparison of:
- **Left**: Original GeoCLIP top-5 predictions
- **Right**: Evidence-adjusted ranking showing which predictions moved up/down

## Setup Instructions

### 1. Install Python Dependencies

```bash
cd fastapi_app
pip install -r requirements.txt
```

Key new dependencies:
- `google-cloud-vision>=3.4.0` - For landmark, label, and OCR detection
- `roboflow>=1.1.0` - For object detection with pretrained models
- `python-dotenv>=1.0.0` - For environment variable management

### 2. Set Up Google Cloud Vision API

1. **Create a Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project

2. **Enable the Vision API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Cloud Vision API"
   - Click "Enable"

3. **Create a Service Account**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Create a service account with any name
   - Click on the created service account
   - Go to "Keys" > "Add Key" > "Create new key" > "JSON"
   - This downloads a JSON key file

4. **Set Environment Variable**:
   ```bash
   # On Windows (PowerShell):
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\your\service-account-key.json"
   
   # On macOS/Linux:
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"
   ```

### 3. Set Up Roboflow API

1. **Create a Roboflow Account**:
   - Go to [roboflow.com](https://roboflow.com/)
   - Sign up for a free account

2. **Get Your API Key**:
   - In the Roboflow dashboard, go to Settings
   - Copy your API key

3. **Set Environment Variable**:
   ```bash
   # On Windows (PowerShell):
   $env:ROBOFLOW_API_KEY="your_roboflow_api_key_here"
   
   # On macOS/Linux:
   export ROBOFLOW_API_KEY="your_roboflow_api_key_here"
   ```

### 4. Install Node Dependencies and Build Frontend

```bash
npm install
npm run build
```

### 5. Start the Application

**Terminal 1 - FastAPI Backend**:
```bash
cd fastapi_app
uvicorn main:app --reload --port 8000
```

**Terminal 2 - Next.js Frontend**:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## API Changes

### Prediction Response (Enhanced)

The `/predict` endpoint now returns:

```json
{
  "status": "completed",
  "top_prediction": {
    "rank": 1,
    "latitude": 48.8566,
    "longitude": 2.3522,
    "label": "Paris, France",
    "confidence": 0.87
  },
  "alternatives": [...],
  "current_weather": {...},
  "evidence": {
    "landmarks": [
      {"name": "Eiffel Tower", "confidence": 0.95},
      {"name": "Arc de Triomphe", "confidence": 0.82}
    ],
    "labels": [
      {"name": "Urban landscape", "confidence": 0.91},
      {"name": "Architecture", "confidence": 0.88}
    ],
    "ocr_text": ["METRO", "CAFE", "PARIS"],
    "objects": [
      {
        "label": "car",
        "confidence": 0.92,
        "bbox": {"x_min": 0.1, "y_min": 0.2, "x_max": 0.4, "y_max": 0.6}
      }
    ],
    "extracted_language": "fr"
  },
  "adjusted_ranking": [
    {
      "rank": 1,
      "adjusted_rank": 1,
      "latitude": 48.8566,
      "longitude": 2.3522,
      "label": "Paris, France",
      "confidence": 0.87,
      "adjusted_confidence": 1.0,
      "evidence_multiplier": 1.15
    },
    ...
  ],
  "adjusted_top_prediction": {...}
}
```

## Important Notes on Evidence Scoring

⚠️ **These are heuristic weights, not scientifically validated**

The evidence scoring approach in this version is exploratory and transparent:

- Weights are fixed heuristics, not learned from data
- They have NOT been validated against a held-out test set
- Results should be treated as demonstrative rather than authoritative
- The scoring is intended to show HOW evidence can adjust predictions, not to claim scientific accuracy

To make this production-ready, you would need to:
1. Collect a validation dataset with ground-truth labels
2. Use techniques like logistic regression or a learned weighting model
3. Cross-validate the weights on held-out data
4. Document confidence intervals and limitations

## Architecture Overview

### Backend (FastAPI)
- `build_prediction_result()` - Orchestrates GeoCLIP prediction + evidence extraction
- `extract_evidence_from_image()` - Calls Google Cloud Vision API
- `detect_objects_roboflow()` - Calls Roboflow API for object detection
- `score_evidence_for_location()` - Applies heuristic weights to adjust predictions

### Frontend (Next.js/React)
- **Prediction Tab** - Original GeoCLIP result (top prediction + alternatives)
- **Evidence Tab** - Displays detected landmarks, labels, OCR text, and objects with bounding boxes
- **Prediction Comparison Tab** - Side-by-side view of original vs. evidence-adjusted rankings

## Constraints Maintained from V1

✅ **No face recognition** - Google Vision face detection is explicitly disabled  
✅ **No identity matching** - Labels and objects are only used for scene/geography context  
✅ **No false certainty** - Evidence multipliers cap at 2.0x (max confidence 100%)  
✅ **Transparent about limitations** - All uncertainty and heuristic nature is disclosed in UI  

## Troubleshooting

### "Google Cloud Vision API not enabled"
- Make sure you've enabled the Cloud Vision API in your Google Cloud Console
- Verify your service account has the Vision API permissions

### "Roboflow API key not found"
- Check that `ROBOFLOW_API_KEY` environment variable is set correctly
- Restart the backend after setting the environment variable

### "Evidence tab not showing"
- This tab only appears if evidence was successfully extracted
- Check console logs for Vision API or Roboflow errors
- Make sure your image contains detectable landmarks or text

### "No objects detected"
- The Roboflow model may not detect objects in your image
- Try images with clear vehicles, signs, or infrastructure
- Check that your Roboflow API key has access to the project model

## Next Steps for Production

1. **Validate Evidence Weights** - Test on a held-out dataset of geo-tagged images
2. **Add Explainability Logging** - Track which evidence pieces most influence decisions
3. **Fine-tune Models** - Consider fine-tuning the object detection model on geo-relevant objects
4. **User Studies** - Validate that the explanations actually help users understand predictions
5. **Performance Optimization** - Cache Vision API results for common landmarks
6. **API Rate Limiting** - Add rate limits for Vision API and Roboflow to control costs

## References

- [Google Cloud Vision API Documentation](https://cloud.google.com/vision/docs)
- [Roboflow Universe - Pretrained Models](https://universe.roboflow.com/)
- [GeoCLIP Paper](https://arxiv.org/abs/2307.06667)
