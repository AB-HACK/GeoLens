import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Res,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AnalysisService } from './analysis.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('analysis')
export class AnalysisController {
  // Store active SSE connections by analysisId
  private sseConnections = new Map<string, Response>();

  constructor(private analysisService: AnalysisService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      return { success: false, message: 'No file provided' };
    }

    const result = await this.analysisService.submitAnalysis(
      req.user.id,
      file.buffer,
      file.originalname,
    );

    return {
      success: true,
      analysisId: result.analysisId,
      jobId: result.jobId,
      status: result.status,
    };
  }

  @Get('status/:analysisId')
  @UseGuards(JwtAuthGuard)
  async getStatus(
    @Request() req,
    @Param('analysisId') analysisId: string,
  ) {
    return this.analysisService.getAnalysisStatus(analysisId, req.user.id);
  }

  @Get('result/:analysisId')
  @UseGuards(JwtAuthGuard)
  async getResult(
    @Request() req,
    @Param('analysisId') analysisId: string,
  ) {
    return this.analysisService.getAnalysisResult(analysisId, req.user.id);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getHistory(
    @Request() req,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.analysisService.getHistoricalAnalyses(
      req.user.id,
      limit || 20,
      offset || 0,
    );
  }

  @Get('subscribe/:analysisId')
  @UseGuards(JwtAuthGuard)
  async subscribeToProgress(
    @Request() req,
    @Param('analysisId') analysisId: string,
    @Res() res: Response,
  ) {
    // Verify user owns this analysis
    const analysis = await this.analysisService.getAnalysisStatus(
      analysisId,
      req.user.id,
    );

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Store connection
    this.sseConnections.set(analysisId, res);

    // Send initial status
    res.write(`data: ${JSON.stringify(analysis)}\n\n`);

    // Keep connection alive
    const keepAliveInterval = setInterval(() => {
      res.write(':keepalive\n\n');
    }, 30000);

    // Clean up on disconnect
    res.on('close', () => {
      clearInterval(keepAliveInterval);
      this.sseConnections.delete(analysisId);
    });
  }

  // Helper method for job processor to emit progress
  emitProgress(analysisId: string, stage: string, data?: Record<string, any>) {
    const connection = this.sseConnections.get(analysisId);
    if (connection && !connection.closed) {
      connection.write(
        `data: ${JSON.stringify({ analysisId, stage, data, timestamp: new Date() })}\n\n`,
      );
    }
  }
}
