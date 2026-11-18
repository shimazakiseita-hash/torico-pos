import { handle } from "@/lib/api";
import { businessDayOf } from "@/lib/businessDay";
import { getDb, getNumbering } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(() => Response.json(getNumbering(getDb(), businessDayOf())));
}
