import { handle, parseBody } from "@/lib/api";
import { getDb, renumberOrder } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { emptyActionSchema } from "@/lib/schemas";

export function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/renumber">) {
  return handle(async () => {
    const { id: raw } = await ctx.params;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw new DomainError("NOT_FOUND", "注文が見つかりません");
    await parseBody(request, emptyActionSchema);
    return Response.json(renumberOrder(getDb(), id));
  });
}
