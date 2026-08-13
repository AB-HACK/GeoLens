import {
  Process,
  Processor,
  OnQueueFailed,
  OnQueueCompleted,
} from '@nestjs/bull';
import { Job } from 'bull';
import * as fs from 'fs';
import { AnalysisService } from './analysis.service';
import axios from 'axios';

@Processor('analysis')
export class AnalysisProcessor {
  constructor(private analysisService: AnalysisService) {}

  @Process()
  async processAnalysis(job: Job) {
    const { analysisId, userId, imagePath } = job.data;

    try {
      // Stage 1: Read image
      job.progress(10);
      const imageBuffer = fs.readFileSync(imagePath);

      // Stage 2: Run GeoCLIP model via FastAPI
      job.progress(30);
      const geoclipResult = await this.callGeoCLIPModel(imageBuffer);

      if (!geoclipResult.success) {
        throw new Error('GeoCLIP model failed');
      }

      // Stage 3: Extract evidence (Vision + Roboflow)
      job.progress(60);
      const evidence = await this.extractEvidence(imageBuffer);

      // Stage 4: Combine and score
      job.progress(80);
      const adjustedRanking = this.scoreAndRankEvidence(
        geoclipResult.data,
        evidence,
      );

      // Stage 5: Save results
      job.progress(95);
      await this.analysisService.completeAnalysis(
        analysisId,
        geoclipResult.data,
        evidence,
        adjustedRanking,
      );

      job.progress(100);
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
      
      // Create FormData
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
          current_weather: response.data.current_weather,
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

  private async extractEvidence(imageBuffer: Buffer) {
    // For now, return empty evidence
    // In production, integrate Google Vision and Roboflow here
    // This is a placeholder - actual implementation would call APIs
    return {
      landmarks: [],
      labels: [],
      ocr_text: [],
      objects: [],
      extracted_language: null,
    };
  }

  private scoreAndRankEvidence(geoclipData: any, evidence: any) {
    // Apply heuristic scoring to adjust rankings
    // For now, return original rankings
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
