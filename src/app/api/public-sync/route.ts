import { handle, parseBody } from "@/lib/api";
import { EMPTY_SYNC_STATE, recordSync, syncHealth, type PublicSyncState } from "@/lib/publicSync";
import { publicSyncReportSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

// 送信状況はメモリだけに持つ（サーバーを再起動しても public-sync が数秒で知らせ直す）
const store = globalThis as typeof globalThis & { __toricoPublicSync?: PublicSyncState };

export function GET() {
  return handle(() => Response.json(syncHealth(store.__toricoPublicSync ?? EMPTY_SYNC_STATE, Date.now())));
}

export function POST(request: Request) {
  return handle(async () => {
    const report = await parseBody(request, publicSyncReportSchema);
    store.__toricoPublicSync = recordSync(store.__toricoPublicSync ?? EMPTY_SYNC_STATE, report, new Date());
    return new Response(null, { status: 204 });
  });
}
