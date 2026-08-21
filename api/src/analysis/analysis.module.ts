import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import { AnalysisProcessor } from './analysis.processor';
import { AnalysisProgressService } from './analysis-progress.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'analysis',
    }),
    BullModule.registerQueue({
      name: 'analysis-dlq',
    }),
  ],
  providers: [
    AnalysisService,
    AnalysisProcessor,
    AnalysisProgressService,
    PrismaService,
  ],
  controllers: [AnalysisController],
  exports: [AnalysisService],
})
export class AnalysisModule {}
