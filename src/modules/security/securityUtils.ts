/**
 * Copies text to clipboard and schedules an automatic wipe after `clearAfterSeconds`
 * if the clipboard still appears accessible and the tab is active.
 */
export async function copySecretWithAutoClear(
  value: string,
  clearAfterSeconds: number,
  onClearScheduled?: (expiresAt: number) => void,
  onCleared?: () => void,
): Promise<() => void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    throw new Error('Clipboard API is unavailable in this browser context.');
  }

  await navigator.clipboard.writeText(value);

  if (clearAfterSeconds <= 0) {
    return () => {};
  }

  const expiresAt = Date.now() + clearAfterSeconds * 1000;
  onClearScheduled?.(expiresAt);

  const timer = window.setTimeout(async () => {
    try {
      // Only overwrite if document has focus or clipboard write succeeds cleanly
      await navigator.clipboard.writeText('');
    } catch {
      // Ignore permission restrictions when tab is backgrounded
    } finally {
      onCleared?.();
    }
  }, clearAfterSeconds * 1000);

  return () => {
    window.clearTimeout(timer);
  };
}

export function getCurrentDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Unknown Device';
  const ua = navigator.userAgent;
  let os = 'Desktop';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  return `${browser} on ${os}`;
}

export function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

