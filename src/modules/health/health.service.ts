import { Injectable } from '@nestjs/common';

import { PrismaService } from '@infrastructure/database';
import { RedisService } from '@infrastructure/redis';

export type ComponentStatus = 'up' | 'down';

export interface HealthReport {
  status: ComponentStatus;
  timestamp: string;
  uptimeSeconds: number;
  components: {
    api: { status: ComponentStatus };
    database: { status: ComponentStatus };
    redis: { status: ComponentStatus };
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthReport> {
    const [dbHealthy, redisHealthy] = await Promise.all([
      this.prisma.isHealthy(),
      this.redis.isHealthy(),
    ]);

    const components: HealthReport['components'] = {
      api: { status: 'up' },
      database: { status: dbHealthy ? 'up' : 'down' },
      redis: { status: redisHealthy ? 'up' : 'down' },
    };

    const status: ComponentStatus =
      components.api.status === 'up' &&
      components.database.status === 'up' &&
      components.redis.status === 'up'
        ? 'up'
        : 'down';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      components,
    };
  }
}
