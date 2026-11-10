import type { NextRequest } from "next/server";
import { TOTAL, totalSettings } from "@/lib/admin";
import { handle, parseDayParam } from "@/lib/api";
import { EVENT_DAYS } from "@/lib/businessDay";
import { getDaySettings, getDb, listOrders } from "@/lib/db";
import { computeSummary } from "@/lib/summary";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handle(() => {
    const db = getDb();
    // day=total：2日間の合計
    if (request.nextUrl.searchParams.get("day") === TOTAL) {
      const orders = EVENT_DAYS.flatMap((d) => listOrders(db, d));
      return Response.json(computeSummary(orders, totalSettings(EVENT_DAYS.map((d) => getDaySettings(db, d)))));
    }
    const day = parseDayParam(request.nextUrl.searchParams)!;
    return Response.json(computeSummary(listOrders(db, day), getDaySettings(db, day)));
  });
}
