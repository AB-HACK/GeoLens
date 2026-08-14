import {
  Process,
  Processor,
  OnQueueFailed,
  OnQueueCompleted,
} from '@nestjs/bull';
import { Job } from 'bull';
import * as fs from 'fs';
import axios from 'axios';
import { AnalysisService } from './analysis.service';
import { AnalysisProgressService } from './analysis-progress.service';

@Processor('analysis')
export class AnalysisProcessor {
  constructor(
    private analysisService: AnalysisService,
    private progressService: AnalysisProgressService,
  ) {}

  @Process()
  async processAnalysis(job: Job) {
    const { analysisId, imagePath } = job.data;

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
      form.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), 'image.jpg');

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
      return [city, country].filter(Boolean).join(', ') || null;
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
    try {
      const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: { lat, lon, appid: apiKey, units: 'metric' },
        timeout: 5000,
      });
      // Field names match WeatherInfo in app/results — not OpenWeatherMap's
      // own naming — so the existing UI can consume this directly.
      return {
        description: response.data.weather?.[0]?.description ?? 'Unknown',
        temperature: response.data.main?.temp,
        feels_like: response.data.main?.feels_like,
        humidity: response.data.main?.humidity,
      };
    } catch (error) {
      console.error('Weather lookup failed:', error.message);
      return null;
    }
  }

  private async extractEvidence(imageBuffer: Buffer) {
    // TODO (V2 carry-forward, not yet implemented): call Google Cloud
    // Vision (landmark/label/OCR) and Roboflow object detection here,
    // as documented in V2_EXPLAINABILITY.md. Left as an explicit stub
    // rather than faking results, since scoreAndRankEvidence() below
    // depends on this being real data before it can do anything useful.
    return {
      landmarks: [],
      labels: [],
      ocr_text: [],
      objects: [],
      extracted_language: null,
    };
  }

  private scoreAndRankEvidence(geoclipData: any, evidence: any) {
    // TODO: once extractEvidence() is real, apply the heuristic fusion
    // scoring described in the V2 doc. Until then this is intentionally
    // a passthrough — returning a fake "adjusted" ranking with no real
    // evidence behind it would be worse than clearly returning the
    // original ranking unchanged.
    return geoclipData;
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    console.error(`Job ${job.id} failed:`, err.message);
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    console.log(`Job ${job.id} completed successfully`);
  }
}
