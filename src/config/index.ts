import appConfig from './app.config';
import databaseConfig from './database.config';
import jwtConfig from './jwt.config';
import redisConfig from './redis.config';

export * from './app.config';
export * from './database.config';
export * from './jwt.config';
export * from './redis.config';
export * from './env.validation';

export const configurations = [appConfig, databaseConfig, redisConfig, jwtConfig];
