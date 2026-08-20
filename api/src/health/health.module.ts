import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { HealthController } from './health.controller';
import { PrismaService } from '../common/prisma.service';

@Module({
  imports: [BullModule],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class HealthModule {}
