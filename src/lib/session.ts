/**
 * ミニゲームの「その場かぎりの合言葉」。ゲーム開始時にサーバーが発行し、ランキング登録のときに必ず添える。
 * 中身は 番号.開始時刻.しるし。しるしはサーバーだけが知る鍵で計算した HMAC なので、
 * 開始時刻を書き換えたり、合言葉を自分で作ったりはできない。1回きりかどうかはサーバー側で覚えておく
 */

/** 発行から登録までの期限（遊んだ時間＋名前を入れる時間） */
export const SESSION_TTL_MS = 30 * 60 * 1000;

export type VerifiedSession = { ok: true; id: string; startedAt: number } | { ok: false; reason: "invalid" | "expired" };

function base64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

export async function createSession(secret: string, startedAt: number, id: string): Promise<string> {
  const body = `${id}.${startedAt}`;
  return `${body}.${await sign(secret, body)}`;
}

export async function verifySession(secret: string, token: string, now: number): Promise<VerifiedSession> {
  const m = /^([a-f0-9]{16,32})\.(\d{10,16})\.([A-Za-z0-9_-]{20,64})$/.exec(token);
  if (!m) return { ok: false, reason: "invalid" };
  const [, id, started, sig] = m;
  const expected = await sign(secret, `${id}.${started}`);
  // 長さが同じときだけ1文字ずつ比べる（時間差で中身を推測されにくくする）
  if (expected.length !== sig.length) return { ok: false, reason: "invalid" };
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return { ok: false, reason: "invalid" };
  const startedAt = Number(started);
  if (startedAt > now + 5000 || now - startedAt > SESSION_TTL_MS) return { ok: false, reason: "expired" };
  return { ok: true, id, startedAt };
}
