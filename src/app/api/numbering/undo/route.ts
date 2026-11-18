import { handle, parseBody } from "@/lib/api";
import { getDb, undoSkip } from "@/lib/db";
import { emptyActionSchema } from "@/lib/schemas";

export function POST(request: Request) {
  return handle(async () => {
    await parseBody(request, emptyActionSchema);
    return Response.json(undoSkip(getDb()));
  });
}
