"use client";

import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Heart } from "@/components/Heart";
import { ItemBadges } from "@/components/ItemBadges";
import { KioskBar } from "@/components/KioskBar";
import { Toast, useToast } from "@/components/Toast";
import { ITEMS, SEASONINGS, skuKey } from "@/lib/menu";
import { grillQueue, isLate, recentReady, waitStats } from "@/lib/queues";
import { countBySku, sum } from "@/lib/summary";
import type { Order } from "@/lib/types";
import { useFresh } from "@/lib/useFresh";
import { useKiosk } from "@/lib/useKiosk";
import { useMove } from "@/lib/useMove";
import { useNow } from "@/lib/useNow";
import { usePolling } from "@/lib/usePolling";

const panel = "flex min-h-0 flex-col rounded-[28px] bg-white p-4 shadow-[0_6px_0_rgb(0_0_0/0.12)]";

export function GrillScreen() {
  const orders = usePolling<Order[]>("/api/orders?status=waiting,ready");
  const now = useNow(orders.clockOffsetMs);
  const toast = useToast();
  const { awake, chime } = useKiosk();
  const [soundOn, setSoundOn] = useState(true);
  const { move, isPending } = useMove(orders.refresh, toast.show);

  const all = orders.data ?? [];
  const queue = grillQueue(all);
  const done = recentReady(all);
  const need = countBySku(queue);
  const stats = waitStats(all, now);
  // 新しく入った注文は数秒ハイライトし、音を鳴らす
  const fresh = useFresh(orders.data ? queue.map((o) => o.id) : null, 6000, () => {
    if (soundOn) chime();
  });

  return (
    <div className="bg-candy flex min-h-dvh flex-col lg:h-dvh">
      <AppHeader
        title="焼き場"
        note={stats.count > 0 ? `待ち ${stats.count}件・最長 ${stats.longestMin}分` : "待ちなし"}
        error={orders.status}
      />
      <ConnectionBanner error={orders.error} />
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_26rem]">
        {/* 注文カード（古い順） */}
        <section aria-labelledby="queue-h" className={panel}>
          <h2 id="queue-h" className="mb-3 text-2xl font-black">
            <Heart />
            注文（古い順）
          </h2>
          {queue.length === 0 ? (
            <p className="flex flex-1 items-center justify-center text-2xl text-lav-500">調理待ちの注文はありません</p>
          ) : (
            <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto xl:grid-cols-3">
              {queue.map((o) => {
                const late = isLate(o, now);
                const min = Math.max(0, Math.floor((now - Date.parse(o.createdAt)) / 60000));
                return (
                  <li
                    key={o.id}
                    className={`flex flex-col gap-2 rounded-[18px] border-[3px] p-3 ${
                      late ? "border-danger bg-danger-bg" : "border-lav-300 bg-lav-100"
                    } ${fresh.has(o.id) ? "ring-4 ring-cyan ring-offset-2" : ""}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-5xl leading-none font-black tabular-nums">{o.number}</span>
                      <span className={`tabular-nums ${late ? "text-xl font-black text-danger" : "text-lg text-lav-500"}`}>
                        {min}分{late && " 待ち"}
                      </span>
                    </div>
                    <ItemBadges items={o.items} size="lg" />
                    <button
                      type="button"
                      onClick={() => move(o, "ready")}
                      disabled={isPending(o)}
                      className="btn-pink mt-auto min-h-16 text-2xl"
                    >
                      完成
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex min-h-16 flex-wrap items-center gap-3 border-t-2 border-dashed border-pink-200 pt-3">
            <span className="text-lg text-lav-500">直近の完成</span>
            {done.length === 0 ? (
              <span className="text-lg text-lav-300">なし</span>
            ) : (
              done.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => move(o, "waiting")}
                  disabled={isPending(o)}
                  className="btn-ghost min-h-16 px-4 text-xl"
                >
                  {o.number}番を戻す
                </button>
              ))
            )}
          </div>
        </section>

        {/* いま必要な本数（調理待ちの合計） */}
        <aside aria-labelledby="need-h" className={panel}>
          <h2 id="need-h" className="mb-2 text-2xl font-black">
            <Heart />
            いま必要な本数
          </h2>
          <div className="grid min-h-0 flex-1 grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-2">
            <span />
            {SEASONINGS.map((s) => (
              <span key={s.id} className={`rounded-full border-2 text-center text-lg font-black ${s.bg} ${s.text} ${s.border}`}>
                {s.name}
              </span>
            ))}
            {ITEMS.map((item) => (
              <div key={item.id} className="contents">
                <span className="flex items-center pr-2 text-3xl font-black whitespace-nowrap">{item.name}</span>
                {SEASONINGS.map((s) => {
                  const n = need[skuKey(item.id, s.id)];
                  return (
                    <span
                      key={s.id}
                      aria-label={`${item.name} ${s.name} ${n}本`}
                      className={`flex items-center justify-center rounded-[18px] border-[3px] text-[76px] leading-none font-black tabular-nums ${s.bg} ${s.text} ${s.border} ${n === 0 ? "opacity-35" : ""}`}
                    >
                      {n}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-2xl">
            合計 <b className="text-grad text-6xl font-black tabular-nums">{sum(need)}</b> 本
          </p>
          <button
            type="button"
            onClick={() => setSoundOn((on) => !on)}
            aria-pressed={soundOn}
            className="btn-ghost mt-2 min-h-16 text-lg"
          >
            新しい注文の音：{soundOn ? "オン" : "オフ"}
          </button>
        </aside>
      </main>
      <Toast message={toast.message} onClose={toast.clear} />
      <KioskBar awake={awake} sound={soundOn} />
    </div>
  );
}
