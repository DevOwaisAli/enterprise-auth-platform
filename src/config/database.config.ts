import { registerAs } from '@nestjs/config';

export const DATABASE_CONFIG_KEY = 'database';

export interface DatabaseConfig {
  url: string;
  logQueries: boolean;
}

export default registerAs<DatabaseConfig>(DATABASE_CONFIG_KEY, () => ({
  url: process.env.DATABASE_URL ?? '',
  logQueries: process.env.DATABASE_LOG_QUERIES === 'true',
}));
