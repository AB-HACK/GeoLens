import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';

import { PrismaService } from './common/prisma.service';
import { AppLogger } from './common/logger.service';
import { AuthModule } from './auth/auth.module';
import { AnalysisModule } from './analysis/analysis.module';
import { UserModule } from './user/user.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 10, // 10 requests per minute
      },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRATION || '7d' },
      global: true,
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    BullModule.forRoot({
      redis: process.env.REDIS_URL || 'redis://localhost:6379',
    }),
    BullModule.registerQueue({
      name: 'analysis',
    }),
    BullModule.registerQueue({
      name: 'analysis-dlq', // Dead letter queue for failed jobs
    }),
    AuthModule,
    AnalysisModule,
    UserModule,
    HealthModule,
  ],
  providers: [PrismaService, AppLogger],
  controllers: [],
})
export class AppModule {}
