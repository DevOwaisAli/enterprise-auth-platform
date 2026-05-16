import { registerAs } from '@nestjs/config';

export const SWAGGER_CONFIG_KEY = 'swagger';

export interface SwaggerConfig {
  enabled: boolean;
  path: string;
  title: string;
  description: string;
  version: string;
}

export default registerAs<SwaggerConfig>(SWAGGER_CONFIG_KEY, () => ({
  enabled: process.env.SWAGGER_ENABLED !== 'false',
  path: process.env.SWAGGER_PATH ?? 'api/docs',
  title: process.env.SWAGGER_TITLE ?? 'Enterprise Auth Platform API',
  description: process.env.SWAGGER_DESCRIPTION ?? 'Enterprise authentication and authorization API',
  version: process.env.SWAGGER_VERSION ?? '0.2.0',
}));
