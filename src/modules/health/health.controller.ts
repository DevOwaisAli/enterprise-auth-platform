import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HealthService, type HealthReport } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness + readiness check for API, database and Redis' })
  @ApiOkResponse({ description: 'Health report for the API and its dependencies' })
  check(): Promise<HealthReport> {
    return this.healthService.check();
  }
}
