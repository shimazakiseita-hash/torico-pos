"use client";

import Image from "next/image";
import { AppHeader } from "@/components/AppHeader";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { SKUS, skuName } from "@/lib/menu";
import type { ServerInfo } from "@/lib/serverInfo";
import type { Summary } from "@/lib/summary";
import { usePolling } from "@/lib/usePolling";

const PAGES = [
  { path: "/register", label: "受付" },
  { path: "/kitchen", label: "キッチン" },
  { path: "/display", label: "呼び出し表示" },
  { path: "/admin", label: "管理" },
] as const;

function formatWait(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-black text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function AdminScreen() {
  const summary = usePolling<Summary>("/api/summary");
  const server = usePolling<ServerInfo>("/api/server-info", 10_000);
  const s = summary.data;

  const ratio = s ? s.soldTotal / s.targetQty : 0;
  const progress = Math.min(100, ratio * 100);

  return (
    <>
      <AppHeader title="管理" error={summary.status} />
      <ConnectionBanner error={summary.error} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
        <Card title="売上">
          <p className="text-5xl font-black tabular-nums">{s ? `${s.revenue.toLocaleString()}円` : "…"}</p>
          <p className="mt-1 text-2xl font-black text-ink tabular-nums">
            レジ内現金の理論値 {s ? `${s.expectedCash.toLocaleString()}円` : "…"}
          </p>
          <p className="mt-2 text-sm text-gray-500">釣り銭準備金 {s?.cashFloat.toLocaleString() ?? "…"}円＋売上。閉店後、実際の現金と照合してください</p>
        </Card>

        <Card title="販売数">
          <p className="text-4xl font-black tabular-nums">
            {s?.soldTotal ?? "…"}
            <span className="text-xl font-bold text-gray-500"> / 目標 {s?.targetQty ?? "…"}本</span>
          </p>
          {/* 進捗バー：マスコットが目標に向かって進む（両端ではみ出さないよう左右に余白） */}
          <div className="mt-4 px-5">
            <div
              className="relative h-5 rounded-full bg-gray-200"
              role="progressbar"
              aria-label="目標に対する販売数"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-danger transition-[width] duration-700" style={{ width: `${progress}%` }} />
              <Image
                src="/brand/mascot.jpg"
                alt=""
                width={549}
                height={526}
                className="absolute top-1/2 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-700"
                style={{ left: `${progress}%` }}
              />
            </div>
          </div>
          <p className="mt-2 flex justify-between text-sm text-gray-600 tabular-nums">
            <span>{ratio >= 1 ? <span className="font-black text-danger">目標達成！</span> : `あと ${s ? s.targetQty - s.soldTotal : "…"}本`}</span>
            <span>{Math.round(ratio * 100)}%</span>
          </p>

          <table className="mt-3 w-full text-lg">
            <thead>
              <tr className="text-left text-sm text-gray-500">
                <th className="py-1 font-normal">品目</th>
                <th className="py-1 text-right font-normal">販売本数</th>
              </tr>
            </thead>
            <tbody>
              {SKUS.map((sku) => (
                <tr key={sku.key} className="border-t">
                  <td className="py-2 font-bold">{skuName(sku.item, sku.seasoning)}</td>
                  <td className="py-2 text-right tabular-nums">{s?.soldBySku[sku.key] ?? "…"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="待ち状況">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-sm text-gray-500">焼き待ち</dt>
              <dd className="text-3xl font-black tabular-nums">{s?.waitingCount ?? "…"}件</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">呼び出し中</dt>
              <dd className="text-3xl font-black tabular-nums">{s?.readyCount ?? "…"}件</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">平均待ち時間</dt>
              <dd className="text-2xl font-black tabular-nums">{s ? formatWait(s.avgWaitSeconds) : "…"}</dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-gray-500">平均待ち時間：直近10件の、注文から受け渡しまで</p>
        </Card>

        <Card title="バックアップ">
          <a
            href="/api/export.csv"
            download
            className="press flex min-h-16 items-center justify-center rounded-2xl bg-space-700 text-xl font-bold text-white active:bg-space-500"
          >
            全注文をCSVでダウンロード
          </a>
          <p className="mt-2 text-sm text-gray-500">営業中は1時間ごとにダウンロードしてください</p>
        </Card>

        <Card title="他の端末をつなぐとき">
          {!server.data ? (
            <p className="text-gray-500">…</p>
          ) : server.data.urls.length === 0 ? (
            <p className="font-bold text-danger">LANのIPアドレスが見つかりません。Wi-Fi（TORICO-POS）が動いているか確認してください</p>
          ) : (
            server.data.urls.map((url) => (
              <div key={url} className="mb-3">
                <p className="mb-2 text-2xl font-black break-all">{url}</p>
                <ul className="flex flex-col gap-1 text-base">
                  {PAGES.map((p) => (
                    <li key={p.path} className="flex gap-2">
                      <span className="w-28 shrink-0 text-gray-600">{p.label}</span>
                      <span className="font-mono break-all">
                        {url}
                        {p.path}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          <p className="mt-1 text-sm text-gray-500">各端末で Wi-Fi「TORICO-POS」につないでから開いてください</p>
        </Card>
      </main>
    </>
  );
}
