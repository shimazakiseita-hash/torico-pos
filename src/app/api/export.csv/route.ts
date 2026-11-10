import type { NextRequest } from "next/server";
import { handle, parseDayParam } from "@/lib/api";
import { formatLocal, ordersToCsv } from "@/lib/csv";
import { getDb, listOrders } from "@/lib/db";

export const dynamic = "force-dynamic";

/** day=YYYY-MM-DD（省略時は今日）、day=all で全営業日 */
export function GET(request: NextRequest) {
  return handle(() => {
    const day = parseDayParam(request.nextUrl.searchParams, { allowAll: true });
    const stamp = formatLocal(new Date().toISOString()).replace(/[-: ]/g, "").slice(0, 12);
    return new Response(ordersToCsv(listOrders(getDb(), day)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="torico-orders-${day ?? "all"}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
