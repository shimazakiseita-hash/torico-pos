"use client";

import { AppHeader } from "@/components/AppHeader";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Heart } from "@/components/Heart";
import { ItemBadges } from "@/components/ItemBadges";
import { KioskBar } from "@/components/KioskBar";
import { Toast, useToast } from "@/components/Toast";
import { handoffQueue, recentServed, upcomingNumbers } from "@/lib/queues";
import type { Order } from "@/lib/types";
import { useFresh } from "@/lib/useFresh";
import { useKiosk } from "@/lib/useKiosk";
import { useMove } from "@/lib/useMove";
import { usePolling } from "@/lib/usePolling";

const panel = "panel flex min-h-0 flex-col p-4";

export function HandoffScreen() {
  const orders = usePolling<Order[]>("/api/orders?status=waiting,ready,served");
  const toast = useToast();
  const { awake } = useKiosk();
  const { move, isPending } = useMove(orders.refresh, toast.show);

  const all = orders.data ?? [];
  const ready = handoffQueue(all);
  const upcoming = upcomingNumbers(all);
  const served = recentServed(all);
  // 新しく完成した注文は数秒ハイライト
  const fresh = useFresh(orders.data ? ready.map((o) => o.id) : null);

  return (
    <div className="bg-candy flex min-h-dvh flex-col lg:h-dvh">
      <AppHeader title="渡し場" note={`呼び出し中 ${ready.length}件`} error={orders.status} />
      <ConnectionBanner error={orders.error} />
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_24rem]">
        {/* 呼び出し中（完成した順） */}
        <section aria-labelledby="ready-h" className={panel}>
          <h2 id="ready-h" className="mb-3 text-2xl font-black">
            <Heart />
            呼び出し中（完成した順）
          </h2>
          {ready.length === 0 ? (
            <p className="flex flex-1 items-center justify-center text-2xl text-lav-500">呼び出し中の注文はありません</p>
          ) : (
            <ul aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {ready.map((o) => (
                <li
                  key={o.id}
                  className={`flex items-center gap-4 rounded-[18px] border-[3px] bg-pink-100 px-4 py-2 ${
                    fresh.has(o.id) ? "border-cyan ring-4 ring-cyan" : "border-pink-200"
                  }`}
                >
                  <span className="text-grad w-32 shrink-0 text-[4.5rem] leading-none font-black tabular-nums">{o.number}</span>
                  <span className="flex-1">
                    <ItemBadges items={o.items} size="md" />
                  </span>
                  <button
                    type="button"
                    onClick={() => move(o, "served")}
                    disabled={isPending(o)}
                    className="btn-ok min-h-20 w-44 shrink-0 text-3xl"
                  >
                    渡した
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className={`${panel} gap-4`}>
          {/* このあと来る番号（表示のみ） */}
          <section aria-labelledby="upcoming-h" className="flex min-h-0 flex-1 flex-col">
            <h2 id="upcoming-h" className="mb-3 text-2xl font-black">
              <Heart />
              このあと来る番号
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-xl text-lav-500">なし</p>
            ) : (
              <ul className="flex min-h-0 flex-wrap content-start gap-2 overflow-y-auto">
                {upcoming.map((n) => (
                  <li
                    key={n}
                    className="min-w-16 rounded-[14px] border-[3px] border-lav-300 bg-lav-100 px-2 text-center text-3xl leading-[3rem] font-black tabular-nums"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 受け渡し済み（直近）：押し間違いを呼び出し中へ戻す */}
          <section aria-labelledby="served-h" className="border-t-2 border-dashed border-pink-200 pt-3">
            <h2 id="served-h" className="mb-2 text-lg text-lav-500">
              受け渡し済み（直近）
            </h2>
            {served.length === 0 ? (
              <p className="text-lg text-lav-300">なし</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {served.map((o) => (
                  <li key={o.id} className="flex items-center gap-3">
                    <span className="w-14 text-3xl font-black text-lav-500 tabular-nums">{o.number}</span>
                    <span className="flex-1">
                      <ItemBadges items={o.items} size="sm" />
                    </span>
                    <button
                      type="button"
                      onClick={() => move(o, "ready")}
                      disabled={isPending(o)}
                      className="btn-ghost min-h-16 w-24 shrink-0 text-xl"
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
      <KioskBar awake={awake} />
    </div>
  );
}
