import { registerAs } from '@nestjs/config';

export const DATABASE_CONFIG_KEY = 'database';

export interface DatabaseConfig {
  url: string;
}

export default registerAs<DatabaseConfig>(DATABASE_CONFIG_KEY, () => ({
  url: process.env.DATABASE_URL ?? '',
}));
