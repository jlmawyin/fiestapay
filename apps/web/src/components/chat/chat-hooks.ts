import { useEffect, useState } from 'react';

/** Seconds elapsed while `active`, ticking every second. Resets when idle. */
export function useElapsedSeconds(active: boolean): number {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) {
      setSecs(0);
      return;
    }
    setSecs(0);
    const id = window.setInterval(() => setSecs((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return secs;
}

/**
 * Scrolls the message container so the START of the given message sits at
 * the top, visible without hunting. Uses the container scrollTop only, so
 * the page itself never moves. Returns false when the message is missing.
 */
export function scrollMessageToTop(container: HTMLElement | null, messageId: string): boolean {
  if (!container) return false;
  const target = container.querySelector(`[data-mid="${messageId}"]`);
  if (!(target instanceof HTMLElement)) return false;
  container.scrollTop = Math.max(0, target.offsetTop - 8);
  return true;
}

/** Shows the just-sent question plus the thinking indicator. */
export function scrollContainerToBottom(container: HTMLElement | null): void {
  if (container) container.scrollTop = container.scrollHeight;
}
