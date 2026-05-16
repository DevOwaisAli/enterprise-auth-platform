import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  API_PREFIX: Joi.string().default('api'),
  API_DEFAULT_VERSION: Joi.string().default('1'),
  CORS_ORIGIN: Joi.string().default('*'),
  BODY_LIMIT: Joi.string().default('10mb'),
  APP_URL: Joi.string().uri().default('http://localhost:3000'),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  DATABASE_LOG_QUERIES: Joi.boolean().truthy('true').falsy('false').default(false),

  REDIS_HOST: Joi.string().hostname().default('localhost'),
  REDIS_PORT: Joi.number().integer().min(1).max(65535).default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().integer().min(0).default(0),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  JWT_ISSUER: Joi.string().default('enterprise-auth-platform'),
  JWT_AUDIENCE: Joi.string().default('enterprise-auth-platform-clients'),

  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(4).max(20).default(12),
  PASSWORD_MIN_LENGTH: Joi.number().integer().min(8).max(256).default(12),
  PASSWORD_REQUIRE_UPPERCASE: Joi.boolean().truthy('true').falsy('false').default(true),
  PASSWORD_REQUIRE_LOWERCASE: Joi.boolean().truthy('true').falsy('false').default(true),
  PASSWORD_REQUIRE_NUMBER: Joi.boolean().truthy('true').falsy('false').default(true),
  PASSWORD_REQUIRE_SPECIAL: Joi.boolean().truthy('true').falsy('false').default(true),
  PASSWORD_HISTORY_LIMIT: Joi.number().integer().min(0).max(50).default(5),
  MAX_LOGIN_ATTEMPTS: Joi.number().integer().min(1).default(5),
  LOCK_DURATION_MS: Joi.number()
    .integer()
    .min(0)
    .default(15 * 60 * 1000),
  EMAIL_VERIFICATION_TOKEN_TTL_MS: Joi.number()
    .integer()
    .min(60_000)
    .default(24 * 60 * 60 * 1000),
  PASSWORD_RESET_TOKEN_TTL_MS: Joi.number()
    .integer()
    .min(60_000)
    .default(60 * 60 * 1000),
  SESSION_TTL_MS: Joi.number()
    .integer()
    .min(60_000)
    .default(7 * 24 * 60 * 60 * 1000),

  MAIL_HOST: Joi.string().hostname().default('localhost'),
  MAIL_PORT: Joi.number().integer().min(1).max(65535).default(587),
  MAIL_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  MAIL_USER: Joi.string().allow('').optional(),
  MAIL_PASSWORD: Joi.string().allow('').optional(),
  MAIL_FROM: Joi.string().email().default('no-reply@example.com'),
  MAIL_FROM_NAME: Joi.string().default('Enterprise Auth Platform'),

  QUEUE_PREFIX: Joi.string().default('eap'),
  QUEUE_DEFAULT_ATTEMPTS: Joi.number().integer().min(1).default(3),
  QUEUE_DEFAULT_BACKOFF_MS: Joi.number().integer().min(0).default(5000),

  THROTTLE_TTL_MS: Joi.number().integer().min(1).default(60_000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),

  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  SWAGGER_PATH: Joi.string().default('api/docs'),
  SWAGGER_TITLE: Joi.string().default('Enterprise Auth Platform API'),
  SWAGGER_DESCRIPTION: Joi.string().default('Enterprise authentication and authorization API'),
  SWAGGER_VERSION: Joi.string().default('0.3.0'),

  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('debug'),
  LOG_PRETTY: Joi.boolean().truthy('true').falsy('false').default(true),
}).unknown(true);
