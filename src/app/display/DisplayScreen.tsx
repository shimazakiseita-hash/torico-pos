"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { KioskBar } from "@/components/KioskBar";
import { ITEMS, UNIT_PRICE } from "@/lib/menu";
import type { Order } from "@/lib/types";
import { useKiosk } from "@/lib/useKiosk";
import { usePolling } from "@/lib/usePolling";

const HIGHLIGHT_MS = 6000;

/** 水しぶきのしずく：飛ぶ方向（角度）と開始の遅れ */
const DROPS = [
  { a: "-70deg", d: "0s" },
  { a: "-25deg", d: "0.35s" },
  { a: "20deg", d: "0.15s" },
  { a: "65deg", d: "0.5s" },
  { a: "-115deg", d: "0.25s" },
  { a: "110deg", d: "0.6s" },
];

export function DisplayScreen() {
  const orders = usePolling<Order[]>("/api/orders?status=waiting,ready");
  const kiosk = useKiosk();
  const all = orders.data ?? [];
  const ready = all
    .filter((o) => o.status === "ready")
    .sort((a, b) => Date.parse(b.readyAt ?? "") - Date.parse(a.readyAt ?? ""));
  const waiting = all.filter((o) => o.status === "waiting");

  // 新しく ready になった番号を数秒間ハイライトする（画面を開いた時点の番号は対象外）
  const known = useRef<Set<number> | null>(null);
  const [highlighted, setHighlighted] = useState<Set<number>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const readyKey = ready.map((o) => o.id).join(",");

  useEffect(() => {
    if (!orders.data) return;
    const ids = readyKey ? readyKey.split(",").map(Number) : [];
    if (known.current === null) {
      known.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !known.current!.has(id));
    known.current = new Set(ids);
    if (fresh.length === 0) return;
    setHighlighted((s) => new Set([...s, ...fresh]));
    // 続けて別の番号が ready になっても消えるよう、タイマーは effect のやり直しで止めない
    timers.current.push(
      setTimeout(() => {
        setHighlighted((s) => new Set([...s].filter((id) => !fresh.includes(id))));
      }, HIGHLIGHT_MS),
    );
  }, [readyKey, orders.data]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  return (
    <div className="bg-seigaiha flex min-h-dvh flex-1 flex-col text-white">
      <ConnectionBanner error={orders.error} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 p-4 md:p-6">
        <Image
          src="/brand/logo.png"
          alt="およげない！たいやきくん"
          width={752}
          height={799}
          priority
          className="mx-auto h-auto w-[min(62vw,18rem)] drop-shadow-[0_0.5rem_0_rgb(0_0_0/0.35)] md:w-[20rem] xl:w-[22rem]"
        />

        <section aria-labelledby="ready-heading" className="flex flex-1 flex-col">
          <h1
            id="ready-heading"
            className="mx-auto mb-2 rounded-full bg-red px-8 py-2 text-center text-4xl font-black tracking-wider shadow-[0_0.3rem_0_rgb(0_0_0/0.3)] md:text-5xl"
          >
            お呼び出し中
          </h1>
          <p className="mb-5 text-center text-lg font-bold text-white/90 md:text-xl">
            番号札をお持ちのうえ、受け取り口へお越しください
          </p>

          {ready.length === 0 ? (
            <IdlePanel baking={waiting.length > 0} />
          ) : (
            <ul
              aria-live="polite"
              className="flex flex-wrap justify-center gap-x-[4%] gap-y-6 px-1"
            >
              {ready.map((o) => {
                const isNew = highlighted.has(o.id);
                const label = String(o.number);
                return (
                  <li key={o.id} className="relative w-[30%] sm:w-[22%] lg:w-[16%] xl:w-[13%]">
                    <div className={`ukiwa ${isNew ? "ukiwa-new" : ""}`}>
                      <div className="ukiwa-inner" data-digits={label.length}>
                        {label}
                      </div>
                      {isNew &&
                        DROPS.map((drop) => (
                          <span
                            key={drop.a}
                            className="splash-drop"
                            style={{ "--a": drop.a, "--d": drop.d } as CSSProperties}
                            aria-hidden
                          />
                        ))}
                    </div>
                    {isNew && (
                      <p className="mt-2 text-center text-base font-black text-yellow-300 md:text-lg">できあがり！</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="baking-heading" className="rounded-3xl bg-white/10 p-4 backdrop-blur-[1px]">
          <h2 id="baking-heading" className="mb-3 text-center text-xl font-bold text-white/80">
            焼いています
            {waiting.length > 0 && <span className="ml-2 text-base font-normal">（{waiting.length}件）</span>}
          </h2>
          {waiting.length === 0 ? (
            <p className="text-center text-lg text-white/60">ただいま焼き待ちはありません</p>
          ) : (
            <ul className="flex flex-wrap justify-center gap-2">
              {waiting.map((o) => (
                <li
                  key={o.id}
                  className="min-w-14 rounded-xl bg-white/15 px-3 py-1 text-center text-2xl font-bold text-white/75 md:text-3xl"
                >
                  {o.number}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <KioskBar awake={kiosk.awake} />
    </div>
  );
}

/** 呼び出し中の番号がない時間の案内：キャラクターとメニューのおすすめ */
function IdlePanel({ baking }: { baking: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 rounded-[2rem] bg-white p-5 text-ink shadow-[0_0.5rem_0_rgb(0_0_0/0.3)] sm:flex-row sm:p-6">
      <Image
        src="/brand/character.png"
        alt=""
        width={512}
        height={512}
        className="drift w-36 shrink-0 sm:w-44"
      />
      <div className="flex w-full flex-col gap-3 text-center sm:text-left">
        <p className="text-2xl font-black text-navy">
          {baking ? "いっしょうけんめい焼いています！" : "いらっしゃいませ！"}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-start">
          <span className="text-xl font-bold">
            1本 <span className="text-3xl font-black text-red">{UNIT_PRICE}</span>円
          </span>
        </div>
        <p className="text-lg font-bold">たれ・塩から選べます！</p>
        <ul className="flex flex-wrap justify-center gap-2 sm:justify-start">
          {ITEMS.map((i) => (
            <li key={i.id} className="rounded-full bg-white px-3 py-1 text-base font-bold text-ink">
              {i.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
