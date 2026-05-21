import { createHash } from 'node:crypto';

import { generatePkcePair, generateState } from './pkce.util';
import { isSafeRedirect, sanitizeRedirect } from './redirect.util';

describe('pkce.util', () => {
  it('generates a verifier and a matching S256 challenge', () => {
    const pair = generatePkcePair(32);
    expect(pair.codeChallengeMethod).toBe('S256');
    const expected = createHash('sha256')
      .update(pair.codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(pair.codeChallenge).toBe(expected);
  });

  it('generates url-safe state strings', () => {
    const state = generateState(32);
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('redirect.util', () => {
  const base = 'https://app.example.com';

  it('allows relative paths', () => {
    expect(isSafeRedirect('/dashboard', base)).toBe(true);
  });

  it('rejects protocol-relative urls', () => {
    expect(isSafeRedirect('//evil.com', base)).toBe(false);
  });

  it('allows same-origin absolute urls', () => {
    expect(isSafeRedirect('https://app.example.com/x', base)).toBe(true);
  });

  it('rejects cross-origin urls', () => {
    expect(isSafeRedirect('https://evil.com/x', base)).toBe(false);
  });

  it('falls back when the target is unsafe', () => {
    expect(sanitizeRedirect('https://evil.com', base, '/safe')).toBe('/safe');
  });
});
