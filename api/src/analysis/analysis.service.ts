import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../common/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AnalysisService {
  private uploadsDir: string;
  private userJobCounts = new Map<string, number>();
  private readonly MAX_CONCURRENT_JOBS_PER_USER = 3;

  constructor(
    private prisma: PrismaService,
    @InjectQueue('analysis') private analysisQueue: Queue,
  ) {
    this.uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    this.ensureUploadsDirectory();
  }

  private ensureUploadsDirectory() {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async submitAnalysis(userId: string, imageBuffer: Buffer, imageFilename: string) {
    // Check user's current job count
    const currentJobCount = this.userJobCounts.get(userId) || 0;
    if (currentJobCount >= this.MAX_CONCURRENT_JOBS_PER_USER) {
      throw new BadRequestException(
        `Maximum concurrent jobs (${this.MAX_CONCURRENT_JOBS_PER_USER}) reached. Please wait for current jobs to complete.`,
      );
    }

    // Ensure uploads directory exists
    this.ensureUploadsDirectory();

    // Generate unique filename
    const filename = `${Date.now()}-${imageFilename}`;
    const filepath = path.join(this.uploadsDir, filename);

    // Save file to disk
    fs.writeFileSync(filepath, imageBuffer);

    // Create analysis record
    const analysis = await this.prisma.analysis.create({
      data: {
        userId,
        imageReference: filename,
        status: 'PENDING',
      },
    });

    // Queue the job with priority based on user's current load
    const priority = this.calculateJobPriority(userId);
    const job = await this.analysisQueue.add(
      {
        analysisId: analysis.id,
        userId,
        imageFilename: filename,
        imagePath: filepath,
      },
      {
        priority,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );

    // Increment user's job count
    this.userJobCounts.set(userId, currentJobCount + 1);

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

  private calculateJobPriority(userId: string): number {
    // Higher priority (lower number) for users with fewer active jobs
    const currentJobCount = this.userJobCounts.get(userId) || 0;
    // Priority range: 1 (highest) to 10 (lowest)
    return Math.min(currentJobCount + 1, 10);
  }

  async decrementUserJobCount(userId: string) {
    const currentCount = this.userJobCounts.get(userId) || 0;
    if (currentCount > 0) {
      this.userJobCounts.set(userId, currentCount - 1);
    }
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
