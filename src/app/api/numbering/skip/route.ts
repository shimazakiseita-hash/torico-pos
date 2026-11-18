import { handle, parseBody } from "@/lib/api";
import { getDb, skipNumber } from "@/lib/db";
import { emptyActionSchema } from "@/lib/schemas";

export function POST(request: Request) {
  return handle(async () => {
    await parseBody(request, emptyActionSchema);
    return Response.json(skipNumber(getDb()));
  });
}
