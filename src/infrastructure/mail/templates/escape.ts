const ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return value.replace(/[&<>"']/g, (char) => ENTITY_MAP[char] ?? char);
}

export function escapeAttr(value: string | null | undefined): string {
  return escapeHtml(value);
}
