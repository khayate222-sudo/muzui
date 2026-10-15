import type { Store } from "./db";
export const mediaQuota = 200 * 1024 * 1024;
export function usedMediaBytes(
  store: Store,
  userId: string,
  excludingActivity?: string,
) {
  const files = (
    store.sqlite
      .prepare(
        "SELECT COALESCE(SUM(bytes),0) AS n FROM media_uploads WHERE owner_id=?",
      )
      .get(userId) as { n: number }
  ).n;
  const photos = (
    store.sqlite
      .prepare(
        "SELECT COALESCE(SUM(length(photo)),0) AS n FROM activities WHERE user_id=? AND (? IS NULL OR id<>?)",
      )
      .get(userId, excludingActivity || null, excludingActivity || null) as {
      n: number;
    }
  ).n;
  return files + photos;
}
