import type { NextRequest } from "next/server";
import { handle, parseDayParam } from "@/lib/api";
import { getDaySettings, getDb, listOrders } from "@/lib/db";
import { computeSummary } from "@/lib/summary";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handle(() => {
    const db = getDb();
    const day = parseDayParam(request.nextUrl.searchParams)!;
    return Response.json(computeSummary(listOrders(db, day), getDaySettings(db, day)));
  });
}
