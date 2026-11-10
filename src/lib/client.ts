"use client";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** JSON を送って結果を受け取る。通信失敗やエラー応答も例外にせず ApiResult で返す */
export async function sendJson<T>(method: "POST" | "PATCH" | "PUT", url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const error = (json as { error?: string } | null)?.error ?? `エラーが発生しました（${res.status}）`;
      return { ok: false, error };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "サーバーにつながりません。Wi-Fi「TORICO-POS」の接続を確認してください" };
  }
}

export function setOrderStatus(id: number, status: string) {
  return sendJson("PATCH", `/api/orders/${id}`, { status });
}
