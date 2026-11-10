"use client";

import { AppHeader } from "@/components/AppHeader";
import { useEffect, useRef, useState } from "react";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { KioskBar } from "@/components/KioskBar";
import { ItemBadges } from "@/components/ItemBadges";
import { Toast, useToast } from "@/components/Toast";
import { setOrderStatus } from "@/lib/client";
import { SEASONING_BY_ID, SKUS, skuName } from "@/lib/menu";
import type { OrderStatus } from "@/lib/status";
import { countBySku, sum } from "@/lib/summary";
import type { Order } from "@/lib/types";
import { useKiosk } from "@/lib/useKiosk";
import { formatElapsed, useNow } from "@/lib/useNow";
import { usePolling } from "@/lib/usePolling";

const LATE_MS = 10 * 60 * 1000;
const RECENT_SERVED = 3;

export function KitchenScreen() {
  const orders = usePolling<Order[]>("/api/orders?status=waiting,ready,served");
  const now = useNow(orders.clockOffsetMs);
  const toast = useToast();
  const [pending, setPending] = useState<Set<number>>(new Set());
  const { awake, chime } = useKiosk();
  const [soundOn, setSoundOn] = useState(true);

  // 新しい注文が来たら鳴らす（画面を開いた時点の注文は対象外）
  const knownIds = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!orders.data) return;
    const ids = orders.data.map((o) => o.id);
    if (knownIds.current === null) {
      knownIds.current = new Set(ids);
      return;
    }
    const fresh = ids.some((id) => !knownIds.current!.has(id));
    for (const id of ids) knownIds.current.add(id);
    if (fresh && soundOn) chime();
  }, [orders.data, soundOn, chime]);

  const all = orders.data ?? [];
  const waiting = all.filter((o) => o.status === "waiting");
  const ready = all
    .filter((o) => o.status === "ready")
    .sort((a, b) => Date.parse(a.readyAt ?? a.createdAt) - Date.parse(b.readyAt ?? b.createdAt));
  const served = all
    .filter((o) => o.status === "served")
    .sort((a, b) => Date.parse(b.servedAt ?? "") - Date.parse(a.servedAt ?? ""))
    .slice(0, RECENT_SERVED);
  const toBake = countBySku(waiting);

  async function move(order: Order, to: OrderStatus) {
    setPending((s) => new Set(s).add(order.id));
    const res = await setOrderStatus(order.id, to);
    if (!res.ok) toast.show(res.error);
    await orders.refresh();
    setPending((s) => {
      const next = new Set(s);
      next.delete(order.id);
      return next;
    });
  }

  return (
    <>
      <AppHeader title="キッチン" error={orders.status} />
      <ConnectionBanner error={orders.error} />
      <section aria-label="焼くべき数" className="grid grid-cols-6 gap-3 p-3 pb-0">
        {SKUS.map((sku) => (
          <div
            key={sku.key}
            className={`rounded-2xl border-2 px-3 py-2 text-center ${SEASONING_BY_ID[sku.seasoning].bg} ${SEASONING_BY_ID[sku.seasoning].text} ${SEASONING_BY_ID[sku.seasoning].border}`}
          >
            <div className="text-xl font-black">{skuName(sku.item, sku.seasoning)}</div>
            <div className={`text-5xl leading-tight font-black tabular-nums ${toBake[sku.key] === 0 ? "opacity-40" : ""}`}>
              {toBake[sku.key]}
            </div>
          </div>
        ))}
        <div className="rounded-2xl bg-space-700 px-3 py-2 text-center text-white shadow-[0_0.25rem_0_rgb(0_0_0/0.2)]">
          <div className="text-2xl font-black">焼くべき数</div>
          <div className="text-7xl leading-tight font-black tabular-nums">{sum(toBake)}</div>
        </div>
      </section>

      <main className="grid flex-1 grid-cols-[2fr_1fr] gap-4 p-3">
        <section>
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-2xl font-black text-ink">
              焼き待ち <span className="tabular-nums">{waiting.length}</span>件
              <span className="ml-3 text-base font-normal text-gray-600">古い順</span>
            </h2>
            <button
              type="button"
              onClick={() => setSoundOn((on) => !on)}
              aria-pressed={soundOn}
              className={`press ml-auto min-h-12 rounded-full border-2 px-4 text-lg font-bold ${
                soundOn ? "border-space-700 bg-space-700 text-white" : "border-gray-400 bg-white text-gray-600"
              }`}
            >
              新しい注文の音：{soundOn ? "オン" : "オフ"}
            </button>
          </div>
          {waiting.length === 0 ? (
            <p className="rounded-2xl bg-white p-8 text-center text-2xl text-gray-500">焼き待ちの注文はありません</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
              {waiting.map((o) => {
                const elapsed = now - Date.parse(o.createdAt);
                const late = elapsed >= LATE_MS;
                return (
                  <li key={o.id} className="flex overflow-hidden rounded-2xl bg-white shadow-sm">
                    {/* 左端の帯：焼き待ち＝紫、10分以上＝黄 */}
                    <span className={`w-4 shrink-0 ${late ? "bg-beak" : "bg-space-700"}`} aria-hidden />
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div className="flex items-center gap-3">
                        <span className="text-6xl leading-none font-black text-ink tabular-nums">{o.number}</span>
                        <span className="flex-1">
                          {late ? (
                            <span className="rounded-full bg-beak px-3 py-1 text-lg font-black text-ink">10分以上待ち</span>
                          ) : (
                            <span className="text-lg font-bold text-gray-600">焼き待ち</span>
                          )}
                        </span>
                        <span className={`text-3xl font-black tabular-nums ${late ? "text-ink" : "text-gray-600"}`}>
                          {formatElapsed(elapsed)}
                        </span>
                      </div>
                      <ItemBadges items={o.items} size="lg" />
                      <button
                        type="button"
                        onClick={() => move(o, "ready")}
                        disabled={pending.has(o.id)}
                        className="press min-h-20 rounded-2xl bg-ok text-3xl font-black text-white shadow-[0_0.25rem_0_rgb(0_0_0/0.2)] disabled:opacity-40"
                      >
                        完成
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-2xl font-black text-ok">
              呼び出し中 <span className="tabular-nums">{ready.length}</span>件
            </h2>
            {ready.length === 0 ? (
              <p className="text-xl text-gray-500">なし</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {ready.map((o) => (
                  <li key={o.id} className="flex overflow-hidden rounded-xl bg-lav-100">
                    <span className="w-3 shrink-0 bg-ok" aria-hidden />
                    <div className="flex-1 p-3">
                      <div className="mb-2 flex items-center gap-3">
                        <span className="text-5xl leading-none font-black text-ink tabular-nums">{o.number}</span>
                        <ItemBadges items={o.items} size="sm" />
                      </div>
                      <div className="grid grid-cols-[2fr_1fr] gap-2">
                        <button
                          type="button"
                          onClick={() => move(o, "served")}
                          disabled={pending.has(o.id)}
                          className="press min-h-16 rounded-2xl bg-ok text-2xl font-black text-white disabled:opacity-40"
                        >
                          渡した
                        </button>
                        <button
                          type="button"
                          onClick={() => move(o, "waiting")}
                          disabled={pending.has(o.id)}
                          className="press min-h-16 rounded-2xl border-2 border-gray-400 bg-white text-xl font-bold active:bg-gray-100 disabled:opacity-40"
                        >
                          戻す
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-xl font-bold text-gray-600">最近渡した注文</h2>
            {served.length === 0 ? (
              <p className="text-lg text-gray-500">なし</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {served.map((o) => (
                  <li key={o.id} className="flex items-center gap-3">
                    <span className="w-16 text-3xl font-black text-gray-500 tabular-nums">{o.number}</span>
                    <span className="flex-1">
                      <ItemBadges items={o.items} size="sm" />
                    </span>
                    <button
                      type="button"
                      onClick={() => move(o, "ready")}
                      disabled={pending.has(o.id)}
                      className="press min-h-16 w-24 rounded-2xl border-2 border-gray-400 text-xl font-bold active:bg-gray-100 disabled:opacity-40"
                    >
                      戻す
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </main>
      <Toast message={toast.message} onClose={toast.clear} />
      <KioskBar awake={awake} sound={soundOn} />
    </>
  );
}
