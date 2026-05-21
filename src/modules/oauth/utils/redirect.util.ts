export function isSafeRedirect(target: string, allowedBaseUrl: string): boolean {
  if (!target) {
    return false;
  }
  // Only allow relative paths or same-origin absolute URLs.
  if (target.startsWith('/') && !target.startsWith('//')) {
    return true;
  }
  try {
    const targetUrl = new URL(target);
    const baseUrl = new URL(allowedBaseUrl);
    return targetUrl.origin === baseUrl.origin;
  } catch {
    return false;
  }
}

export function sanitizeRedirect(
  target: string | undefined,
  allowedBaseUrl: string,
  fallback: string,
): string {
  if (target && isSafeRedirect(target, allowedBaseUrl)) {
    return target;
  }
  return fallback;
}
