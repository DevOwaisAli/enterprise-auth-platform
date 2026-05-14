import { registerAs } from '@nestjs/config';

export const APP_CONFIG_KEY = 'app';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'staging' | 'production';
  port: number;
  apiPrefix: string;
  corsOrigin: string;
  isProduction: boolean;
  isDevelopment: boolean;
  swagger: {
    enabled: boolean;
    path: string;
  };
  logLevel: string;
}

export default registerAs<AppConfig>(APP_CONFIG_KEY, () => {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];
  return {
    nodeEnv,
    port: Number(process.env.PORT ?? 3000),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
    isProduction: nodeEnv === 'production',
    isDevelopment: nodeEnv === 'development',
    swagger: {
      enabled: process.env.SWAGGER_ENABLED !== 'false',
      path: process.env.SWAGGER_PATH ?? 'api/docs',
    },
    logLevel: process.env.LOG_LEVEL ?? 'debug',
  };
});
