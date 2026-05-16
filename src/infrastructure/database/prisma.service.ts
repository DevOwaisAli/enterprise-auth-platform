import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';

import { type DatabaseConfig, DATABASE_CONFIG_KEY } from '@config/database.config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<DatabaseConfig>(DATABASE_CONFIG_KEY);
    const log: Prisma.LogDefinition[] = config.logQueries
      ? [
          { level: 'query', emit: 'event' },
          { level: 'warn', emit: 'event' },
          { level: 'error', emit: 'event' },
        ]
      : [
          { level: 'warn', emit: 'event' },
          { level: 'error', emit: 'event' },
        ];

    super({ datasources: { db: { url: config.url } }, log });

    if (config.logQueries) {
      this.$on('query' as never, (event: Prisma.QueryEvent) => {
        this.logger.debug(`${event.duration}ms ${event.query}`);
      });
    }
    this.$on('warn' as never, (event: Prisma.LogEvent) => this.logger.warn(event.message));
    this.$on('error' as never, (event: Prisma.LogEvent) => this.logger.error(event.message));
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to PostgreSQL');
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL', error as Error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.warn(`Database health check failed: ${(error as Error).message}`);
      return false;
    }
  }
}
