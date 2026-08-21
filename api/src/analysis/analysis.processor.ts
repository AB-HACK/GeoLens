import {
  Process,
  Processor,
  OnQueueFailed,
  OnQueueCompleted,
  InjectQueue,
} from '@nestjs/bull';
import { Job, Queue } from 'bull';
import * as fs from 'fs';
import axios from 'axios';
import { AnalysisService } from './analysis.service';
import { AnalysisProgressService } from './analysis-progress.service';

// Simple in-memory cache with TTL
class SimpleCache {
  private cache = new Map<string, { data: any; expiresAt: number }>();
  private readonly DEFAULT_TTL = 3600000; // 1 hour in milliseconds

  set(key: string, value: any, ttl = this.DEFAULT_TTL) {
    this.cache.set(key, {
      data: value,
      expiresAt: Date.now() + ttl,
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  clear() {
    this.cache.clear();
  }
}

@Processor('analysis')
export class AnalysisProcessor {
  private geocodeCache = new SimpleCache();
  private weatherCache = new SimpleCache();

  constructor(
    private analysisService: AnalysisService,
    private progressService: AnalysisProgressService,
    @InjectQueue('analysis-dlq') private dlq: Queue,
  ) {}

  @Process()
  async processAnalysis(job: Job) {
    const { analysisId, userId, imagePath } = job.data;

    try {
      // Stage 1: Read image
      job.progress(10);
      this.progressService.emit(analysisId, 'Reading uploaded image', 10);
      const imageBuffer = fs.readFileSync(imagePath);

      // Stage 2: Run GeoCLIP model via FastAPI
      job.progress(30);
      this.progressService.emit(analysisId, 'Running geolocation model', 30);
      const geoclipResult = await this.callGeoCLIPModel(imageBuffer);

      if (!geoclipResult.success) {
        throw new Error('GeoCLIP model failed');
      }

      // Stage 3: Enrich top prediction with place name + current weather.
      // This was part of V1's definition of done but was dropped when the
      // ML service was slimmed down to "GeoCLIP inference only" in V3 —
      // restoring it here since NestJS is where enrichment now belongs.
      job.progress(45);
      this.progressService.emit(analysisId, 'Looking up location context', 45);
      const enrichedPrediction = await this.enrichTopPrediction(
        geoclipResult.data.top_prediction,
      );
      geoclipResult.data.top_prediction = enrichedPrediction;
      geoclipResult.data.alternatives = this.labelAlternatives(
        geoclipResult.data.alternatives,
      );

      // Stage 4: Extract evidence (Vision + Roboflow)
      job.progress(65);
      this.progressService.emit(analysisId, 'Fetching evidence', 65);
      const evidence = await this.extractEvidence(imageBuffer);

      // Stage 5: Combine and score
      job.progress(85);
      this.progressService.emit(analysisId, 'Scoring evidence', 85);
      const adjustedRanking = this.scoreAndRankEvidence(
        geoclipResult.data,
        evidence,
      );

      // Stage 6: Save results
      job.progress(95);
      this.progressService.emit(analysisId, 'Saving results', 95);
      await this.analysisService.completeAnalysis(
        analysisId,
        geoclipResult.data,
        evidence,
        adjustedRanking,
      );

      job.progress(100);
      this.progressService.complete(analysisId, 'COMPLETED');
      return {
        success: true,
        analysisId,
        status: 'COMPLETED',
      };
    } catch (error) {
      await this.analysisService.failAnalysis(
        analysisId,
        error.message || 'Analysis failed',
      );
      this.progressService.complete(analysisId, 'FAILED', {
        error: error.message,
      });
      throw error;
    } finally {
      // Clean up image file
      try {
        fs.unlinkSync(imagePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private async callGeoCLIPModel(imageBuffer: Buffer) {
    try {
      const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

      const form = new FormData();
      const blob = new Blob([imageBuffer as any], { type: 'image/jpeg' });
      form.append('file', blob, 'image.jpg');

      const response = await axios.post(
        `${ML_SERVICE_URL}/predict`,
        form,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 30000,
        },
      );

      return {
        success: true,
        data: {
          top_prediction: response.data.top_prediction,
          alternatives: response.data.alternatives,
          meta: response.data.meta,
        },
      };
    } catch (error) {
      console.error('GeoCLIP error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Adds a human-readable place name (reverse geocoding) and current
   * weather to the top prediction. Both calls are independent and each
   * fails gracefully — a weather-provider outage should degrade the
   * result, not break the whole analysis.
   */
  /**
   * Field names here (label, temperature/feels_like/humidity/description)
   * are dictated by the existing frontend UI (app/results — see
   * PredictionLocation and WeatherInfo types), not chosen fresh. Keeping
   * them aligned is what makes the results page actually render instead
   * of silently showing "undefined" everywhere.
   */
  private async enrichTopPrediction(topPrediction: any) {
    if (!topPrediction) return topPrediction;
    const { latitude, longitude } = topPrediction;

    const [placeName, weather] = await Promise.all([
      this.reverseGeocode(latitude, longitude),
      this.getCurrentWeather(latitude, longitude),
    ]);

    return {
      ...topPrediction,
      label: placeName || this.coordinateLabel(latitude, longitude),
      current_weather: weather, // null if the lookup failed — UI already handles this
    };
  }

  /**
   * Alternatives don't get a full reverse-geocode call each (5 extra
   * network round-trips per analysis against a free-tier provider isn't
   * worth it for secondary results) — they get a readable coordinate
   * label instead, so the UI always has a non-empty .label to render.
   */
  private labelAlternatives(alternatives: any[]) {
    return (alternatives || []).map((alt) => ({
      ...alt,
      label: this.coordinateLabel(alt.latitude, alt.longitude),
    }));
  }

  private coordinateLabel(lat: number, lon: number): string {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lon).toFixed(2)}°${lonDir}`;
  }

  private async reverseGeocode(lat: number, lon: number): Promise<string | null> {
    const cacheKey = `geocode:${lat.toFixed(4)}:${lon.toFixed(4)}`;
    const cached = this.geocodeCache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: { lat, lon, format: 'json' },
        headers: { 'User-Agent': 'GeoLens/3.0 (portfolio project)' },
        timeout: 5000,
      });
      const address = response.data?.address;
      if (!address) return null;
      const city = address.city || address.town || address.village || address.county;
      const country = address.country;
      const result = [city, country].filter(Boolean).join(', ') || null;
      
      // Cache the result for 1 hour
      if (result) {
        this.geocodeCache.set(cacheKey, result, 3600000);
      }
      
      return result;
    } catch (error) {
      console.error('Reverse geocoding failed:', error.message);
      return null;
    }
  }

  private async getCurrentWeather(lat: number, lon: number) {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      // Not treated as a hard failure — weather is enrichment, not core output.
      return null;
    }

    const cacheKey = `weather:${lat.toFixed(4)}:${lon.toFixed(4)}`;
    const cached = this.weatherCache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: { lat, lon, appid: apiKey, units: 'metric' },
        timeout: 5000,
      });
      // Field names match WeatherInfo in app/results — not OpenWeatherMap's
      // own naming — so the existing UI can consume this directly.
      const result = {
        description: response.data.weather?.[0]?.description ?? 'Unknown',
        temperature: response.data.main?.temp,
        feels_like: response.data.main?.feels_like,
        humidity: response.data.main?.humidity,
      };
      
      // Cache the result for 30 minutes (weather changes more frequently)
      this.weatherCache.set(cacheKey, result, 1800000);
      
      return result;
    } catch (error) {
      console.error('Weather lookup failed:', error.message);
      return null;
    }
  }

  private async extractEvidence(imageBuffer: Buffer) {
    // Evidence extraction implementation with Vision API integration
    // This is a structured stub that can be extended with actual API calls
    
    const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;
    const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;

    // If no API keys are configured, return empty evidence
    if (!GOOGLE_VISION_API_KEY && !ROBOFLOW_API_KEY) {
      console.log('Evidence extraction skipped: No API keys configured');
      return {
        landmarks: [],
        labels: [],
        ocr_text: [],
        objects: [],
        extracted_language: null,
      };
    }

    try {
      // Google Cloud Vision API integration for landmarks, labels, and OCR
      let landmarks: any[] = [];
      let labels: any[] = [];
      let ocrText: string[] = [];
      let extractedLanguage: string | null = null;

      if (GOOGLE_VISION_API_KEY) {
        try {
          const visionResponse = await axios.post(
            `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
            {
              requests: [
                {
                  image: {
                    content: imageBuffer.toString('base64'),
                  },
                  features: [
                    { type: 'LANDMARK_DETECTION', maxResults: 5 },
                    { type: 'LABEL_DETECTION', maxResults: 10 },
                    { type: 'TEXT_DETECTION', maxResults: 10 },
                  ],
                },
              ],
            },
            { timeout: 15000 },
          );

          const responses = visionResponse.data.responses?.[0];
          if (responses) {
            // Extract landmarks
            landmarks = (responses.landmarkAnnotations || []).map((annotation: any) => ({
              name: annotation.description,
              confidence: annotation.score || 0.5,
              locations: annotation.locations || [],
            }));

            // Extract labels
            labels = (responses.labelAnnotations || []).map((annotation: any) => ({
              name: annotation.description,
              confidence: annotation.score || 0.5,
            }));

            // Extract OCR text
            const textAnnotations = responses.textAnnotations || [];
            if (textAnnotations.length > 0) {
              ocrText = textAnnotations
                .slice(1) // Skip the first one which is the full text
                .map((annotation: any) => annotation.description || '')
                .filter((text: string) => text.trim().length > 0);
              
              // Detect language from full text
              if (textAnnotations[0]?.locale) {
                extractedLanguage = textAnnotations[0].locale.split('-')[0];
              }
            }
          }
        } catch (visionError) {
          console.error('Google Vision API error:', visionError.message);
          // Continue with empty results if Vision API fails
        }
      }

      // Roboflow integration for object detection
      let objects: any[] = [];
      if (ROBOFLOW_API_KEY) {
        try {
          const roboflowResponse = await axios.post(
            `https://detect.roboflow.com/your-model/1?api_key=${ROBOFLOW_API_KEY}`,
            imageBuffer,
            {
              headers: { 'Content-Type': 'image/jpeg' },
              timeout: 15000,
            },
          );

          objects = (roboflowResponse.data.predictions || []).map((prediction: any) => ({
            label: prediction.class || prediction.label,
            confidence: prediction.confidence || 0.5,
            bbox: {
              x_min: prediction.x || 0,
              y_min: prediction.y || 0,
              x_max: (prediction.x || 0) + (prediction.width || 0),
              y_max: (prediction.y || 0) + (prediction.height || 0),
            },
          }));
        } catch (roboflowError) {
          console.error('Roboflow API error:', roboflowError.message);
          // Continue with empty results if Roboflow fails
        }
      }

      return {
        landmarks,
        labels,
        ocr_text: ocrText,
        objects,
        extracted_language: extractedLanguage,
      };
    } catch (error) {
      console.error('Evidence extraction failed:', error.message);
      // Return empty evidence on failure to not break the analysis pipeline
      return {
        landmarks: [],
        labels: [],
        ocr_text: [],
        objects: [],
        extracted_language: null,
      };
    }
  }

  private scoreAndRankEvidence(geoclipData: any, evidence: any) {
    // Evidence-based scoring and ranking adjustment
    // This implements heuristic fusion scoring as described in V2 documentation
    
    const { top_prediction, alternatives } = geoclipData;
    const { landmarks, labels, ocr_text, objects, extracted_language } = evidence;
    
    // If no evidence was extracted, return original ranking unchanged
    if (!evidence || (
      (!landmarks || landmarks.length === 0) &&
      (!labels || labels.length === 0) &&
      (!ocr_text || ocr_text.length === 0) &&
      (!objects || objects.length === 0)
    )) {
      return geoclipData;
    }

    // Calculate evidence strength score (0-1)
    const evidenceStrength = this.calculateEvidenceStrength(evidence);
    
    // Adjust confidence scores based on evidence
    const adjustedTopPrediction = {
      ...top_prediction,
      original_confidence: top_prediction.confidence,
      adjusted_confidence: this.adjustConfidence(top_prediction.confidence, evidenceStrength),
      evidence_multiplier: evidenceStrength,
      adjusted_rank: 1,
    };

    const adjustedAlternatives = alternatives.map((alt: any, index: number) => ({
      ...alt,
      original_confidence: alt.confidence,
      adjusted_confidence: this.adjustConfidence(alt.confidence, evidenceStrength * 0.8), // Slightly lower for alternatives
      evidence_multiplier: evidenceStrength * 0.8,
      adjusted_rank: index + 2,
    }));

    // Re-rank based on adjusted confidence
    const allPredictions = [adjustedTopPrediction, ...adjustedAlternatives];
    allPredictions.sort((a: any, b: any) => b.adjusted_confidence - a.adjusted_confidence);
    
    // Update adjusted ranks after sorting
    allPredictions.forEach((pred: any, index: number) => {
      pred.adjusted_rank = index + 1;
    });

    return {
      ...geoclipData,
      top_prediction: allPredictions[0],
      alternatives: allPredictions.slice(1),
      adjusted_ranking: allPredictions,
      evidence_summary: {
        strength: evidenceStrength,
        landmark_count: landmarks?.length || 0,
        label_count: labels?.length || 0,
        ocr_count: ocr_text?.length || 0,
        object_count: objects?.length || 0,
        detected_language: extracted_language,
      },
    };
  }

  private calculateEvidenceStrength(evidence: any): number {
    const { landmarks, labels, ocr_text, objects } = evidence;
    
    let strength = 0;
    
    // Landmarks provide strong evidence
    if (landmarks && landmarks.length > 0) {
      const avgLandmarkConfidence = landmarks.reduce((sum: number, l: any) => sum + (l.confidence || 0.5), 0) / landmarks.length;
      strength += Math.min(landmarks.length * 0.15, 0.4) * avgLandmarkConfidence;
    }
    
    // Labels provide moderate evidence
    if (labels && labels.length > 0) {
      const avgLabelConfidence = labels.reduce((sum: number, l: any) => sum + (l.confidence || 0.5), 0) / labels.length;
      strength += Math.min(labels.length * 0.05, 0.3) * avgLabelConfidence;
    }
    
    // OCR text provides moderate evidence
    if (ocr_text && ocr_text.length > 0) {
      strength += Math.min(ocr_text.length * 0.08, 0.25);
    }
    
    // Objects provide supporting evidence
    if (objects && objects.length > 0) {
      const avgObjectConfidence = objects.reduce((sum: number, o: any) => sum + (o.confidence || 0.5), 0) / objects.length;
      strength += Math.min(objects.length * 0.05, 0.2) * avgObjectConfidence;
    }
    
    // Cap strength at 1.0
    return Math.min(strength, 1.0);
  }

  private adjustConfidence(originalConfidence: number, evidenceMultiplier: number): number {
    // Blend original confidence with evidence strength
    // Evidence can increase confidence but not decrease it below a minimum threshold
    const minConfidence = 0.1;
    const adjusted = originalConfidence + (evidenceMultiplier * 0.3);
    
    return Math.max(minConfidence, Math.min(adjusted, 1.0));
  }

  @OnQueueFailed()
  async onFailed(job: Job, err: Error) {
    console.error(`Job ${job.id} failed:`, err.message);
    
    // Send failed job to dead letter queue for inspection and potential retry
    try {
      await this.dlq.add({
        originalJobId: job.id,
        originalData: job.data,
        error: err.message,
        failedAt: new Date(),
        attempts: job.attemptsMade,
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      });
    } catch (dlqError) {
      console.error('Failed to add job to DLQ:', dlqError.message);
    }
  }

  @OnQueueCompleted()
  async onCompleted(job: Job) {
    console.log(`Job ${job.id} completed successfully`);
    // Decrement user's job count on completion
    if (job.data.userId) {
      await this.analysisService.decrementUserJobCount(job.data.userId);
    }
  }
}
