import { z } from "zod";
import { businessDayOf } from "./businessDay";
import { DomainError, HTTP_STATUS } from "./errors";
import { businessDaySchema } from "./schemas";

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

/** リクエストボディをJSONとして読み、zod で検証する。失敗時は 400 の DomainError */
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new DomainError("INVALID_INPUT", "JSONの形式が不正です");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new DomainError("INVALID_INPUT", z.prettifyError(result.error));
  }
  return result.data;
}

/** Route Handler 本体を包み、DomainError を {error} 形式のレスポンスに変換する */
export async function handle(fn: () => Response | Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DomainError) return jsonError(HTTP_STATUS[e.code], e.message);
    console.error(e);
    return jsonError(500, "サーバーでエラーが発生しました");
  }
}

/** クエリの day（YYYY-MM-DD）。省略時は今日の営業日。allowAll なら "all"（全営業日）で null を返す */
export function parseDayParam(params: URLSearchParams, { allowAll = false } = {}): string | null {
  const raw = params.get("day");
  if (raw === null || raw === "") return businessDayOf();
  if (allowAll && raw === "all") return null;
  const parsed = businessDaySchema.safeParse(raw);
  if (!parsed.success) throw new DomainError("INVALID_INPUT", "day は YYYY-MM-DD で指定してください");
  return parsed.data;
}
