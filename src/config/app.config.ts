import { registerAs } from '@nestjs/config';

export const APP_CONFIG_KEY = 'app';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'staging' | 'production';
  port: number;
  apiPrefix: string;
  apiDefaultVersion: string;
  corsOrigin: string;
  bodyLimit: string;
  appUrl: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  logLevel: string;
  logPretty: boolean;
}

export default registerAs<AppConfig>(APP_CONFIG_KEY, () => {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];
  return {
    nodeEnv,
    port: Number(process.env.PORT ?? 3000),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    apiDefaultVersion: process.env.API_DEFAULT_VERSION ?? '1',
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
    bodyLimit: process.env.BODY_LIMIT ?? '10mb',
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
    isProduction: nodeEnv === 'production',
    isDevelopment: nodeEnv === 'development',
    isTest: nodeEnv === 'test',
    logLevel: process.env.LOG_LEVEL ?? 'debug',
    logPretty: process.env.LOG_PRETTY !== 'false',
  };
});
