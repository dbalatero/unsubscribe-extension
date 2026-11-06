export type Status = 'pending' | 'kept' | 'opened';
export interface Capture {
  name: string;
  email: string;
  url: string;
}
export interface Entry extends Capture {
  key: string;
  status: Status;
  capturedAt: string;
}
export type Request =
  | { type: 'capture'; capture: Capture }
  | { type: 'list' }
  | { type: 'status'; key: string; status: Status }
  | { type: 'open' };
export type Reply = { ok: true; entries: Entry[]; opened?: number } | { ok: false; error: string };

export function isInboxMessage(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === 'https://app.fastmail.com' && /^\/mail\/Inbox\/[^/]+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function webUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function senderKey(email: string, name: string): string {
  const domain = email.trim().toLowerCase().match(/^[^\s@<>]+@([a-z0-9.-]+\.[a-z]{2,})$/)?.[1];
  return domain ? `domain:${domain}` : `name:${name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

export function isCapture(value: unknown): value is Capture {
  if (!value || typeof value !== 'object') return false;
  const c = value as Capture;
  return typeof c.name === 'string' && c.name.trim().length > 0 && c.name.length <= 300 &&
    typeof c.email === 'string' && c.email.length <= 320 &&
    typeof c.url === 'string' && c.url.length <= 16000 && webUrl(c.url) !== null;
}

export function isStatus(value: unknown): value is Status {
  return value === 'pending' || value === 'kept' || value === 'opened';
}

export function isEntry(value: unknown): value is Entry {
  if (!isCapture(value)) return false;
  const e = value as Entry;
  return e.key === senderKey(e.email, e.name) && isStatus(e.status) &&
    typeof e.capturedAt === 'string' && Number.isFinite(Date.parse(e.capturedAt));
}
