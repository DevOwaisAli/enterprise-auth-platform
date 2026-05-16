import { type Request } from 'express';

export function extractClientIp(req: Request): string | undefined {
  const forwardedFor = req.header('x-forwarded-for');
  if (forwardedFor && forwardedFor.length > 0) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first && first.length > 0) {
      return first;
    }
  }

  const realIp = req.header('x-real-ip');
  if (realIp && realIp.length > 0) {
    return realIp;
  }

  return req.ip ?? req.socket.remoteAddress ?? undefined;
}

export function extractUserAgent(req: Request): string | undefined {
  const ua = req.header('user-agent');
  return ua && ua.length > 0 ? ua : undefined;
}
