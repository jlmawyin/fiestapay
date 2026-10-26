/** One mailbox, ASCII, no header injection. Display names and lists are rejected. */
const MAILBOX =
  /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function hasControl(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function normalizeMailbox(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length > 254) return null;
  if (hasControl(raw)) return null;
  const value = raw.trim().toLowerCase();
  if (value.length < 3 || value.length > 254) return null;
  if (/[\s,;<>()"'\\]/.test(value) || value.includes('..')) return null;
  if (!MAILBOX.test(value)) return null;
  return value;
}

/** Organizer-only mask. The domain stays so they can recognize the mailbox. */
export function maskMailbox(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`;
}
