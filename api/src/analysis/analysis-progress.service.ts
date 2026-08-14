import { Injectable } from '@nestjs/common';
import { Response } from 'express';

/**
 * Bridges progress events from AnalysisProcessor (which runs the actual
 * job) to any SSE clients subscribed via AnalysisController.
 *
 * Previously, the processor called BullMQ's job.progress(n), and the
 * controller separately held its own sseConnections map with an
 * emitProgress() method that nothing ever called — so subscribers only
 * ever received the initial status message and keepalive pings, never
 * the actual staged updates. This service is the missing connection
 * between the two.
 */
@Injectable()
export class AnalysisProgressService {
  private connections = new Map<string, Response>();

  subscribe(analysisId: string, res: Response) {
    this.connections.set(analysisId, res);
  }

  unsubscribe(analysisId: string) {
    this.connections.delete(analysisId);
  }

  emit(analysisId: string, stage: string, progress?: number, data?: Record<string, any>) {
    const res = this.connections.get(analysisId);
    if (res && !res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({ analysisId, stage, progress, data, timestamp: new Date() })}\n\n`,
      );
    }
  }

  /** Call when a job reaches a terminal state so the client can close cleanly. */
  complete(analysisId: string, stage: 'COMPLETED' | 'FAILED', data?: Record<string, any>) {
    this.emit(analysisId, stage, stage === 'COMPLETED' ? 100 : undefined, data);
    const res = this.connections.get(analysisId);
    if (res && !res.writableEnded) {
      res.end();
    }
    this.unsubscribe(analysisId);
  }
}
