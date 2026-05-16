import { Controller, Get, HttpCode, HttpStatus, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public, ResponseMessage } from '@common/decorators';

import { HealthService, type HealthReport } from './health.service';

@ApiTags('Health')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Health check succeeded')
  @ApiOperation({ summary: 'Liveness + readiness check' })
  @ApiOkResponse({ description: 'Health report with environment and service statuses' })
  check(): Promise<HealthReport> {
    return this.healthService.check();
  }
}
