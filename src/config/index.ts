import appConfig from './app.config';
import databaseConfig from './database.config';
import jwtConfig from './jwt.config';
import mailConfig from './mail.config';
import queueConfig from './queue.config';
import redisConfig from './redis.config';
import swaggerConfig from './swagger.config';
import throttleConfig from './throttle.config';

export * from './app.config';
export * from './database.config';
export * from './env.validation';
export * from './jwt.config';
export * from './mail.config';
export * from './queue.config';
export * from './redis.config';
export * from './swagger.config';
export * from './throttle.config';

export const configurations = [
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  mailConfig,
  queueConfig,
  swaggerConfig,
  throttleConfig,
];
