export interface JwtAccessPayload {
  sub: string;
  email: string;
  sessionId: string;
  tokenVersion: number;
}

export interface JwtAccessPayloadWithClaims extends JwtAccessPayload {
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}
