import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfig, APP_CONFIG_KEY } from '@config/app.config';
import { PrismaService } from '@infrastructure/database';
import { RedisService } from '@infrastructure/redis';

export type ComponentStatus = 'up' | 'down';

export interface MemoryReport {
  rssMb: number;
  heapTotalMb: number;
  heapUsedMb: number;
  externalMb: number;
}

export interface HealthReport {
  status: ComponentStatus;
  timestamp: string;
  environment: string;
  version: string;
  uptimeSeconds: number;
  memory: MemoryReport;
  services: {
    database: ComponentStatus;
    redis: ComponentStatus;
  };
}

@Injectable()
export class HealthService {
  private readonly appConfig: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    configService: ConfigService,
  ) {
    this.appConfig = configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);
  }

  async check(): Promise<HealthReport> {
    const [dbHealthy, redisHealthy] = await Promise.all([
      this.prisma.isHealthy(),
      this.redis.isHealthy(),
    ]);

    const services = {
      database: dbHealthy ? ('up' as const) : ('down' as const),
      redis: redisHealthy ? ('up' as const) : ('down' as const),
    };
    const status: ComponentStatus =
      services.database === 'up' && services.redis === 'up' ? 'up' : 'down';

    return {
      status,
      timestamp: new Date().toISOString(),
      environment: this.appConfig.nodeEnv,
      version: process.env.npm_package_version ?? '0.0.0',
      uptimeSeconds: Math.round(process.uptime()),
      memory: this.snapshotMemory(),
      services,
    };
  }

  private snapshotMemory(): MemoryReport {
    const usage = process.memoryUsage();
    const toMb = (bytes: number): number => Math.round((bytes / 1024 / 1024) * 100) / 100;
    return {
      rssMb: toMb(usage.rss),
      heapTotalMb: toMb(usage.heapTotal),
      heapUsedMb: toMb(usage.heapUsed),
      externalMb: toMb(usage.external),
    };
  }
}
