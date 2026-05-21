import { createHash, randomBytes } from 'node:crypto';

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generatePkcePair(verifierBytes: number): PkcePair {
  const codeVerifier = base64Url(randomBytes(verifierBytes));
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge, codeChallengeMethod: 'S256' };
}

export function generateState(bytes: number): string {
  return base64Url(randomBytes(bytes));
}
