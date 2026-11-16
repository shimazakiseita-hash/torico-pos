import { TOTAL, totalSettings } from "../admin";
import { handle, jsonError, parseBody, parseDayParam } from "../api";
import { EVENT_DAYS } from "../businessDay";
import { formatLocal, ordersToCsv } from "../csv";
import { DomainError } from "../errors";
import { EMPTY_SYNC_STATE, syncHealth } from "../publicSync";
import { createOrderSchema, putSettingsSchema, statusListSchema, updateStatusSchema } from "../schemas";
import { computeSummary } from "../summary";
import { createOrder, getDaySettings, listOrders, putDaySettings, updateStatus } from "./store";
import { readState, writeState } from "./storage";

export async function respond(request: Request): Promise<Response> {
  return handle(async () => {
    const url = new URL(request.url);
    const params = url.searchParams;
    const path = url.pathname;
    const method = request.method;
    if (path === "/api/server-info" && method === "GET") return Response.json({ ips: [], port: 0, urls: [], practice: true });
    if (path === "/api/public-sync" && method === "GET") return Response.json(syncHealth(EMPTY_SYNC_STATE, Date.now()));
    if (path === "/api/orders" && method === "GET") {
      const day = parseDayParam(params);
      const param = params.get("status");
      const parsed = statusListSchema.safeParse(param ? param.split(",").filter(Boolean) : []);
      if (!parsed.success) throw new DomainError("INVALID_INPUT", "status の指定が不正です");
      return Response.json(listOrders(readState(), day, parsed.data));
    }
    if (path === "/api/orders" && method === "POST") {
      const { items, tendered } = await parseBody(request, createOrderSchema);
      const result = createOrder(readState(), items, tendered);
      writeState(result.state);
      return Response.json(result.value, { status: 201 });
    }
    const match = path.match(/^\/api\/orders\/([^/]+)$/);
    if (match && method === "PATCH") {
      const id = Number(decodeURIComponent(match[1]));
      if (!Number.isInteger(id) || id <= 0) throw new DomainError("NOT_FOUND", "注文が見つかりません");
      const { status } = await parseBody(request, updateStatusSchema);
      const result = updateStatus(readState(), id, status);
      writeState(result.state);
      return Response.json(result.value);
    }
    if (path === "/api/settings" && (method === "GET" || method === "PUT")) {
      const day = parseDayParam(params)!;
      if (method === "GET") return Response.json(getDaySettings(readState(), day));
      const patch = await parseBody(request, putSettingsSchema);
      const result = putDaySettings(readState(), day, patch);
      writeState(result.state);
      return Response.json(result.value);
    }
    if (path === "/api/summary" && method === "GET") {
      const state = readState();
      if (params.get("day") === TOTAL) return Response.json(computeSummary(EVENT_DAYS.flatMap((d) => listOrders(state, d)), totalSettings(EVENT_DAYS.map((d) => getDaySettings(state, d)))));
      const day = parseDayParam(params)!;
      return Response.json(computeSummary(listOrders(state, day), getDaySettings(state, day)));
    }
    if (path === "/api/export.csv" && method === "GET") {
      const day = parseDayParam(params, { allowAll: true });
      const stamp = formatLocal(new Date().toISOString()).replace(/[-: ]/g, "").slice(0, 12);
      return new Response(ordersToCsv(listOrders(readState(), day)), { headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="torico-orders-${day ?? "all"}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      } });
    }
    return jsonError(404, "APIが見つかりません");
  });
}

let installed = false;
export function install(): void {
  if (installed) return;
  installed = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return originalFetch(input, init);
    return respond(new Request(input instanceof Request ? input : url, init));
  };
  document.addEventListener("click", (event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[download]") : null;
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin || url.pathname !== "/api/export.csv") return;
    event.preventDefault();
    void respond(new Request(url)).then(async (response) => {
      if (!response.ok) { window.alert((await response.json()).error); return; }
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = response.headers.get("Content-Disposition")!.match(/filename="([^"]+)"/)![1];
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    });
  });
}
