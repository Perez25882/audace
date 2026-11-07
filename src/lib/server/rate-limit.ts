import "server-only";

const windows = new Map<string, { count: number; expires: number }>();

export function withinLimit(key: string, maximum: number) {
  const now = Date.now();
  if (windows.size >= 1024) {
    for (const [id, entry] of windows) if (entry.expires <= now) windows.delete(id);
    if (windows.size >= 1024 && !windows.has(key)) return false;
  }
  const bucket = windows.get(key);
  if (!bucket || bucket.expires <= now) {
    windows.set(key, { count: 1, expires: now + 60_000 });
    return true;
  }
  if (bucket.count >= maximum) return false;
  bucket.count++;
  return true;
}
