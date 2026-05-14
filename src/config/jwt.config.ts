import { registerAs } from '@nestjs/config';

export const JWT_CONFIG_KEY = 'jwt';

export interface JwtConfig {
  accessSecret: string;
  refreshSecret: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
}

export default registerAs<JwtConfig>(JWT_CONFIG_KEY, () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
}));
