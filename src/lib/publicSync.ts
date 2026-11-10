/** 公開ページへの送信状況（public-sync がサーバーPCに知らせ、管理画面で見る） */
export type PublicSyncState = {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
};

export type PublicSyncHealth =
  | { state: "never" } // まだ一度も送っていない（public-sync が動いていない）
  | { state: "ok"; lastSuccessAt: string; ageSeconds: number }
  | { state: "stale"; lastSuccessAt: string | null; ageSeconds: number | null; error: string | null };

/** これより長く送れていなければ警告する（公開ページの「取得できていません」と同じ60秒） */
export const SYNC_STALE_MS = 60_000;

export const EMPTY_SYNC_STATE: PublicSyncState = { lastAttemptAt: null, lastSuccessAt: null, lastError: null };

export function recordSync(state: PublicSyncState, report: { ok: boolean; error?: string }, now: Date): PublicSyncState {
  const at = now.toISOString();
  return report.ok
    ? { lastAttemptAt: at, lastSuccessAt: at, lastError: null }
    : { lastAttemptAt: at, lastSuccessAt: state.lastSuccessAt, lastError: report.error ?? "送信に失敗しました" };
}

export function syncHealth(state: PublicSyncState, now: number): PublicSyncHealth {
  if (state.lastAttemptAt === null && state.lastSuccessAt === null) return { state: "never" };
  const age = state.lastSuccessAt === null ? null : Math.max(0, Math.round((now - Date.parse(state.lastSuccessAt)) / 1000));
  if (state.lastSuccessAt !== null && age !== null && age * 1000 < SYNC_STALE_MS) {
    return { state: "ok", lastSuccessAt: state.lastSuccessAt, ageSeconds: age };
  }
  return { state: "stale", lastSuccessAt: state.lastSuccessAt, ageSeconds: age, error: state.lastError };
}
