import type { NextRequest } from "next/server";
import { handle, parseBody, parseDayParam } from "@/lib/api";
import { getDaySettings, getDb, putDaySettings } from "@/lib/db";
import { putSettingsSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handle(() => Response.json(getDaySettings(getDb(), parseDayParam(request.nextUrl.searchParams)!)));
}

export function PUT(request: NextRequest) {
  return handle(async () => {
    const day = parseDayParam(request.nextUrl.searchParams)!;
    const patch = await parseBody(request, putSettingsSchema);
    return Response.json(putDaySettings(getDb(), day, patch));
  });
}
