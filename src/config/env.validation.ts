import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  API_PREFIX: Joi.string().default('api'),
  CORS_ORIGIN: Joi.string().default('*'),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  REDIS_HOST: Joi.string().hostname().default('localhost'),
  REDIS_PORT: Joi.number().integer().min(1).max(65535).default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().integer().min(0).default(0),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  SWAGGER_PATH: Joi.string().default('api/docs'),

  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
    .default('debug'),
}).unknown(true);

export type EnvVars = {
  NODE_ENV: 'development' | 'test' | 'staging' | 'production';
  PORT: number;
  API_PREFIX: string;
  CORS_ORIGIN: string;
  DATABASE_URL: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_DB: number;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  SWAGGER_ENABLED: boolean;
  SWAGGER_PATH: string;
  LOG_LEVEL: string;
};
