const storageKey = (slug: string): string => `fp_admin_${slug}`;

export function rememberAdminKey(slug: string, key: string): void {
  if (!slug || !key) return;
  localStorage.setItem(storageKey(slug), key);
}

export function adminKeyFor(slug: string): string | null {
  const value = localStorage.getItem(storageKey(slug));
  return value && value.length > 0 ? value : null;
}

/** Reads `?k=` on /e/:slug/admin, stores it, and strips it before anything else can leak it. */
export function captureAdminKeyFromLocation(): void {
  if (typeof window === 'undefined') return;
  const match = window.location.pathname.match(/^\/e\/([^/]+)\/admin\/?$/);
  if (!match || !match[1]) return;
  const slug = decodeURIComponent(match[1]);
  const url = new URL(window.location.href);
  const key = url.searchParams.get('k');
  if (key === null) return;
  if (key.length > 0) rememberAdminKey(slug, key);
  url.searchParams.delete('k');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

const guestModeration = /^\/guests\/([^/]+)\/(block|unblock|remove)$/;
const conversationModeration = /^\/moderation\/conversations\/([^/]+)\/(block|unblock)$/;
const messageDelete = /^\/moderation\/messages\/([^/]+)$/;

/** One raw path segment. Encoded ids stay one segment. `.` and `..` do not. */
function singleSegment(segment: string): boolean {
  if (segment.length === 0 || segment === '.' || segment === '..') return false;
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.length > 0 && decoded !== '.' && decoded !== '..';
  } catch {
    return false;
  }
}

/**
 * The nine moderation routes, by method and exact shape.
 * A prefix such as `/moderation`, or a substring such as `/block`, is not an organizer call.
 */
function moderationOrganizer(rest: string, verb: string): boolean {
  if (verb === 'GET') {
    return rest === '/moderation/guests' || rest === '/moderation/conversations' || rest === '/moderation/messages';
  }
  if (verb === 'DELETE') {
    const message = messageDelete.exec(rest);
    return message !== null && singleSegment(message[1] ?? '');
  }
  if (verb === 'POST') {
    const guest = guestModeration.exec(rest);
    if (guest && singleSegment(guest[1] ?? '')) return true;
    const conversation = conversationModeration.exec(rest);
    return conversation !== null && singleSegment(conversation[1] ?? '');
  }
  return false;
}

/** Organizer calls only. Public, join, pay, chat and voice stay without the key. */
export function adminHeaderFor(path: string, method: string): string | null {
  const match = path.match(/^\/api\/events\/([^/?]+)/);
  if (!match || !match[1]) return null;
  const slug = decodeURIComponent(match[1]);
  const rest = path.slice(match[0].length).split('?')[0] ?? '';
  const verb = method.toUpperCase();
  const organizer =
    (rest === '/dashboard' && verb === 'GET') ||
    (rest === '/confirm' && verb === 'POST') ||
    (rest === '/close' && verb === 'POST') ||
    (rest === '' && (verb === 'PUT' || verb === 'DELETE')) ||
    (rest === '/recovery' && verb === 'GET') ||
    (rest === '/recovery/contact' && (verb === 'PUT' || verb === 'DELETE')) ||
    (rest === '/organizer-chat' && verb === 'POST') ||
    (rest === '/organizer-chat/history' && verb === 'GET') ||
    (rest === '/organizer-voice/token' && verb === 'POST') ||
    (rest === '/organizer-voice/tool' && verb === 'POST') ||
    moderationOrganizer(rest, verb);
  if (!organizer) return null;
  return adminKeyFor(slug);
}
