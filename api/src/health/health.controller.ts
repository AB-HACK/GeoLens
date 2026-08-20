import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Controller('api/v1/health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('analysis') private analysisQueue: Queue,
  ) {}

  @Get()
  async check() {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: 'unknown',
        redis: 'unknown',
      },
    };

    // Check database connectivity
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      health.services.database = 'healthy';
    } catch (error) {
      health.services.database = 'unhealthy';
      health.status = 'degraded';
    }

    // Check Redis connectivity
    try {
      const client = await this.analysisQueue.client;
      await client.ping();
      health.services.redis = 'healthy';
    } catch (error) {
      health.services.redis = 'unhealthy';
      health.status = 'degraded';
    }

    return health;
  }

  @Get('ready')
  async readiness() {
    // Readiness check - only return 200 if all critical services are ready
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      
      const client = await this.analysisQueue.client;
      await client.ping();

      return {
        status: 'ready',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error('Service not ready');
    }
  }

  @Get('live')
  async liveness() {
    // Liveness check - simple check if the process is running
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
