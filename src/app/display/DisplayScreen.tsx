"use client";

import Image from "next/image";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { KioskBar } from "@/components/KioskBar";
import { ITEMS, UNIT_PRICE } from "@/lib/menu";
import { grillQueue } from "@/lib/queues";
import type { Order } from "@/lib/types";
import { useFresh } from "@/lib/useFresh";
import { useKiosk } from "@/lib/useKiosk";
import { usePolling } from "@/lib/usePolling";

/** 呼び出し中の件数に応じた列数（多いときはタイルを小さくして全部出す） */
const columns = (n: number) => (n <= 6 ? "grid-cols-3" : n <= 12 ? "grid-cols-4" : "grid-cols-5");

export function DisplayScreen() {
  const orders = usePolling<Order[]>("/api/orders?status=waiting,ready");
  const kiosk = useKiosk();
  const all = orders.data ?? [];
  // 新しく完成したものが左上
  const ready = all
    .filter((o) => o.status === "ready")
    .sort((a, b) => Date.parse(b.readyAt ?? "") - Date.parse(a.readyAt ?? "") || b.number - a.number);
  const waiting = grillQueue(all);
  const fresh = useFresh(orders.data ? ready.map((o) => o.id) : null);

  return (
    <div className="bg-space flex min-h-dvh flex-1 flex-col text-white lg:h-dvh">
      <ConnectionBanner error={orders.error} />
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_22.5rem]">
        {/* できあがりました！ */}
        <section aria-labelledby="ready-h" className="panel relative flex min-h-0 flex-col px-7 pt-5 pb-6 text-ink">
          <h1 id="ready-h" className="mb-4 text-center text-[2.75rem] leading-tight font-black tracking-wider">
            <span className="text-grad">できあがりました！</span>
          </h1>
          {ready.length === 0 ? (
            <IdleMessage baking={waiting.length > 0} />
          ) : (
            <ul aria-live="polite" className={`-m-3 grid min-h-0 flex-1 content-start gap-4 overflow-hidden p-3 ${columns(ready.length)}`}>
              {ready.map((o) => (
                <li key={o.id} className="num-tile-wrap">
                  <div
                    className={`num-tile ${fresh.has(o.id) ? "num-tile-new" : ""}`}
                    data-digits={String(o.number).length}
                  >
                    {o.number}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 pl-40 text-center text-2xl">
            整理券をお持ちのうえ、お渡し口へどうぞ <span className="text-pink-500">♥</span>
          </p>
          <Image
            src="/brand/mascot.png"
            alt=""
            width={477}
            height={454}
            priority
            className="drift absolute -bottom-3 -left-3 h-auto w-40"
          />
        </section>

        {/* ロゴ・焼いている番号・キャッチコピー */}
        <aside className="flex min-h-0 flex-col gap-4 text-center">
          <div className="panel shrink-0 p-2">
            <Image
              src="/brand/logo.jpg"
              alt="やきとり TORI♡CO"
              width={800}
              height={795}
              priority
              className="mx-auto h-auto max-h-[38dvh] w-auto rounded-[20px]"
            />
          </div>
          <section aria-labelledby="baking-h" className="flex min-h-0 flex-1 flex-col rounded-[28px] bg-white/15 p-4">
            <h2 id="baking-h" className="mb-2 text-[1.375rem] font-black">
              ただいま焼いています
            </h2>
            {waiting.length === 0 ? (
              <p className="text-lg text-white/70">焼き待ちはありません</p>
            ) : (
              <ul className="flex min-h-0 flex-wrap content-start justify-center gap-2 overflow-hidden">
                {waiting.map((o) => (
                  <li
                    key={o.id}
                    className="min-w-14 rounded-xl bg-white px-3 text-[1.875rem] leading-snug font-black text-ink tabular-nums"
                  >
                    {o.number}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="shrink-0 text-[1.375rem]">
            一本食べたら もう、<b className="text-[1.875rem] font-black text-cyan">トリコ</b>
          </p>
        </aside>
      </main>
      <KioskBar awake={kiosk.awake} />
    </div>
  );
}

/** 呼び出し中の番号がない時間の案内 */
function IdleMessage({ baking }: { baking: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[18px] bg-pink-100 p-6 text-center">
      <p className="text-4xl font-black">{baking ? "いっしょうけんめい焼いています！" : "いらっしゃいませ！"}</p>
      <p className="text-2xl">
        1本 <b className="text-grad text-6xl font-black">{UNIT_PRICE}</b> 円・たれ／塩から選べます
      </p>
      <ul className="flex flex-wrap justify-center gap-2">
        {ITEMS.map((i) => (
          <li key={i.id} className="rounded-full border-[3px] border-pink-200 bg-white px-4 py-1 text-2xl font-black">
            {i.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
