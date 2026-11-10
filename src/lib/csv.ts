import { SKUS, skuName } from "./menu";
import { STATUS_LABELS } from "./status";
import { countBySku } from "./summary";
import type { Order } from "./types";

const BOM = "﻿";

/** ISO8601 を日本時間 "YYYY-MM-DD HH:mm:ss" にする（サーバーPCのタイムゾーン設定に左右されない） */
export function formatLocal(iso: string | null): string {
  if (!iso) return "";
  return new Date(Date.parse(iso) + 9 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

function cell(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** 1行＝1注文、SKU別本数を列に持つCSV。Excel で文字化けしないよう BOM 付き */
export function ordersToCsv(orders: readonly Order[]): string {
  const header = [
    "営業日",
    "番号",
    "状態",
    ...SKUS.map((s) => skuName(s.item, s.seasoning)),
    "本数",
    "金額",
    "預かり",
    "お釣り",
    "注文時刻",
    "完成時刻",
    "受け渡し時刻",
    "取り消し時刻",
  ];
  const rows = orders.map((o) => {
    const counts = countBySku([o]);
    return [
      o.businessDay,
      o.number,
      STATUS_LABELS[o.status],
      ...SKUS.map((s) => counts[s.key]),
      o.totalQty,
      o.amount,
      o.tendered,
      o.changeDue,
      formatLocal(o.createdAt),
      formatLocal(o.readyAt),
      formatLocal(o.servedAt),
      formatLocal(o.cancelledAt),
    ];
  });
  return BOM + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
