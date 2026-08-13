import { Injectable, BadRequestException } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AnalysisService {
  private uploadsDir = './uploads';

  constructor(
    private prisma: PrismaService,
    @InjectQueue('analysis') private analysisQueue: Queue,
  ) {
    this.ensureUploadsDir();
  }

  private ensureUploadsDir() {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async submitAnalysis(userId: string, imageBuffer: Buffer, imageFilename: string) {
    // Save image to disk
    const filename = `${Date.now()}-${imageFilename}`;
    const filepath = path.join(this.uploadsDir, filename);
    fs.writeFileSync(filepath, imageBuffer);

    // Create analysis record
    const analysis = await this.prisma.analysis.create({
      data: {
        userId,
        imageReference: filename,
        status: 'PENDING',
      },
    });

    // Queue the job
    const job = await this.analysisQueue.add(
      {
        analysisId: analysis.id,
        userId,
        imageFilename: filename,
        imagePath: filepath,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );

    // Store job ID
    await this.prisma.analysis.update({
      where: { id: analysis.id },
      data: { jobId: job.id.toString() },
    });

    return {
      analysisId: analysis.id,
      jobId: job.id.toString(),
      status: 'QUEUED',
    };
  }

  async getAnalysisStatus(analysisId: string, userId: string) {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      throw new BadRequestException('Analysis not found');
    }

    if (analysis.userId !== userId) {
      throw new BadRequestException('Unauthorized');
    }

    return {
      analysisId: analysis.id,
      status: analysis.status,
      error: analysis.error,
      createdAt: analysis.createdAt,
    };
  }

  async getAnalysisResult(analysisId: string, userId: string) {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      throw new BadRequestException('Analysis not found');
    }

    if (analysis.userId !== userId) {
      throw new BadRequestException('Unauthorized');
    }

    return {
      analysisId: analysis.id,
      status: analysis.status,
      imageReference: analysis.imageReference,
      geoclipPredictions: analysis.geoclipPredictions,
      evidence: analysis.evidence,
      adjustedRanking: analysis.adjustedRanking,
      createdAt: analysis.createdAt,
    };
  }

  async getHistoricalAnalyses(userId: string, limit = 20, offset = 0) {
    const analyses = await this.prisma.analysis.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        geoclipPredictions: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await this.prisma.analysis.count({
      where: { userId },
    });

    return {
      analyses,
      total,
      limit,
      offset,
    };
  }

  async updateAnalysisProgress(
    analysisId: string,
    stage: string,
    data?: Record<string, any>,
  ) {
    // This is called by the job processor to update progress
    // Data is stored but we mainly emit events to subscribers
    return {
      analysisId,
      stage,
      data,
      timestamp: new Date(),
    };
  }

  async completeAnalysis(
    analysisId: string,
    geoclipPredictions: any,
    evidence: any,
    adjustedRanking: any,
  ) {
    return await this.prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: 'COMPLETED',
        geoclipPredictions,
        evidence,
        adjustedRanking,
      },
    });
  }

  async failAnalysis(analysisId: string, error: string) {
    return await this.prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: 'FAILED',
        error,
      },
    });
  }

  getImagePath(imageReference: string) {
    return path.join(this.uploadsDir, imageReference);
  }
}
