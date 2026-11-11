"use client";

import Image from "next/image";
import { useState, useSyncExternalStore } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Heart } from "@/components/Heart";
import { Toast, useToast } from "@/components/Toast";
import { TOTAL, cashDifference, dayTabs, parseCount } from "@/lib/admin";
import { businessDayOf, dayLabel } from "@/lib/businessDay";
import { ITEMS, SEASONINGS, skuKey, type ItemId, type SkuKey } from "@/lib/menu";
import type { PublicSyncHealth } from "@/lib/publicSync";
import type { ServerInfo } from "@/lib/serverInfo";
import type { Summary } from "@/lib/summary";
import type { DaySettings } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

const PAGES = [
  { path: "/register", label: "受付" },
  { path: "/grill", label: "焼き場" },
  { path: "/handoff", label: "渡し場" },
  { path: "/display", label: "呼び出し表示" },
  { path: "/admin", label: "管理" },
] as const;

const input =
  "h-14 w-full min-w-0 rounded-[14px] border-[3px] border-lav-300 bg-white px-3 text-right text-2xl font-black text-ink tabular-nums focus:border-pink-400 focus:outline-none";

const yen = (n: number) => `${n.toLocaleString()}円`;

function formatWait(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel p-4 ${className}`}>
      <h2 className="mb-3 text-xl font-black text-ink">
        <Heart />
        {title}
      </h2>
      {children}
    </section>
  );
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" });

/** 整理券のQRから開く公開ページへの送信状況。送れていないときは赤で警告する */
function PublicSyncCard({ health }: { health: PublicSyncHealth | null | undefined }) {
  if (!health) return null;
  const warn = health.state !== "ok";
  return (
    <section
      role={warn ? "alert" : undefined}
      className={`panel p-4 ${warn ? "border-[3px] border-danger bg-danger-bg" : ""}`}
    >
      <h2 className="mb-2 text-xl font-black text-ink">
        <Heart />
        公開ページ（整理券のQR）
      </h2>
      {health.state === "ok" && (
        <p className="text-xl tabular-nums">
          <span className="mr-2 inline-block h-3 w-3 rounded-full bg-ok" aria-hidden />
          最終更新 {clock(health.lastSuccessAt)}（{health.ageSeconds}秒前）
        </p>
      )}
      {health.state === "never" && (
        <p className="text-xl font-black text-danger">送信していません（.env.public を置いて npm run event で起動すると送ります）</p>
      )}
      {health.state === "stale" && (
        <>
          <p className="text-xl font-black text-danger tabular-nums">
            ⚠ 公開ページを更新できていません
            {health.lastSuccessAt ? `（最終更新 ${clock(health.lastSuccessAt)}）` : "（まだ一度も送れていません）"}
          </p>
          {health.error && <p className="mt-1 text-base break-all text-danger">{health.error}</p>}
          <p className="mt-1 text-base">受付〜渡し場はこのまま使えます。インターネットがつながると自動で追いつきます</p>
        </>
      )}
    </section>
  );
}

/** この端末のブラウザに覚えておく文字列（再読み込みしても消えない。使えない環境では開いている間だけ） */
const storedListeners = new Set<() => void>();
const storedMemory = new Map<string, string>();
function useStoredText(key: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    (onChange) => {
      storedListeners.add(onChange);
      return () => storedListeners.delete(onChange);
    },
    () => {
      if (storedMemory.has(key)) return storedMemory.get(key)!;
      try {
        return localStorage.getItem(key) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
  const set = (next: string) => {
    storedMemory.set(key, next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // 覚えられなくても、開いている間は使える
    }
    storedListeners.forEach((l) => l());
  };
  return [value, set];
}

/** 設定を保存する（変えた項目だけ送る） */
async function saveSettings(day: string, patch: Record<string, unknown>): Promise<DaySettings> {
  const res = await fetch(`/api/settings?day=${day}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = (await res.json().catch(() => null)) as (DaySettings & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? "保存できませんでした");
  return body;
}

export function AdminScreen() {
  const today = businessDayOf();
  const tabs = dayTabs(today);
  const [day, setDay] = useState(tabs.some((t) => t.key === today) ? today : tabs[0].key);
  const server = usePolling<ServerInfo>("/api/server-info", 10_000);
  const sync = usePolling<PublicSyncHealth>("/api/public-sync", 5_000);
  const toast = useToast();

  return (
    <div className="bg-candy min-h-dvh pb-6">
      <AppHeader title="管理" note={day === TOTAL ? "2日間の合計" : dayLabel(day)} error={sync.status} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
        <PublicSyncCard health={sync.data} />

        {/* 営業日の切り替え */}
        <nav aria-label="営業日" className="panel grid auto-cols-fr grid-flow-col gap-2 p-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={day === t.key}
              onClick={() => setDay(t.key)}
              className={`min-h-16 rounded-[18px] px-1 text-lg font-black ${
                day === t.key ? "btn-pink" : "text-lav-500 active:bg-lav-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <DayView key={day} day={day} onError={toast.show} />

        <Card title="他の端末をつなぐとき">
          {!server.data ? (
            <p className="text-lav-500">…</p>
          ) : server.data.urls.length === 0 ? (
            <p className="font-bold text-danger">LANのIPアドレスが見つかりません。Wi-Fi（TORICO-POS）が動いているか確認してください</p>
          ) : (
            server.data.urls.map((url) => (
              <div key={url} className="mb-3">
                <p className="mb-2 text-2xl font-black break-all">{url}</p>
                <ul className="flex flex-col gap-1 text-base">
                  {PAGES.map((p) => (
                    <li key={p.path} className="flex gap-2">
                      <span className="w-28 shrink-0 text-lav-500">{p.label}</span>
                      <span className="break-all">
                        {url}
                        {p.path}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          <p className="mt-1 text-base text-lav-500">各端末で Wi-Fi「TORICO-POS」につないでから開いてください</p>
        </Card>
      </main>
      <Toast message={toast.message} onClose={toast.clear} />
    </div>
  );
}

/** 選んだ営業日（または合計）の集計と設定 */
function DayView({ day, onError }: { day: string; onError: (message: string) => void }) {
  const total = day === TOTAL;
  const summary = usePolling<Summary>(`/api/summary?day=${day}`);
  const settings = usePolling<DaySettings>(total ? "/api/settings" : `/api/settings?day=${day}`, 5_000);
  const s = summary.data;

  const save = async (patch: Record<string, unknown>) => {
    try {
      await saveSettings(day, patch);
      await Promise.all([summary.refresh(), settings.refresh()]);
      return true;
    } catch (e) {
      onError((e as Error).message);
      return false;
    }
  };

  return (
    <>
      <ConnectionBanner error={summary.error} />
      <SalesCard s={s} />
      <CashCard day={day} s={s} total={total} save={save} />
      <BreakdownCard s={s} />
      {!total && settings.data && s && <StockCard settings={settings.data} s={s} save={save} />}
      <Card title="待ち状況">
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-base text-lav-500">焼き待ち</dt>
            <dd className="text-3xl font-black tabular-nums">{s?.waitingCount ?? "…"}件</dd>
          </div>
          <div>
            <dt className="text-base text-lav-500">呼び出し中</dt>
            <dd className="text-3xl font-black tabular-nums">{s?.readyCount ?? "…"}件</dd>
          </div>
          <div>
            <dt className="text-base text-lav-500">平均待ち時間</dt>
            <dd className="text-2xl font-black tabular-nums">{s ? formatWait(s.avgWaitSeconds) : "…"}</dd>
          </div>
        </dl>
        <p className="mt-2 text-base text-lav-500">平均待ち時間：直近10件の、注文から受け渡しまで</p>
      </Card>
      <Card title="CSV（全注文）">
        <div className="grid gap-3">
          {!total && (
            <a href={`/api/export.csv?day=${day}`} download className="btn-pink flex min-h-16 items-center justify-center text-xl">
              {dayLabel(day)}の注文をダウンロード
            </a>
          )}
          <a href="/api/export.csv?day=all" download className="btn-ghost flex min-h-16 items-center justify-center text-xl">
            全営業日の注文をダウンロード
          </a>
        </div>
        <p className="mt-2 text-base text-lav-500">営業中は1時間ごとにダウンロードしてください（Excel でそのまま開けます）</p>
      </Card>
    </>
  );
}

function SalesCard({ s }: { s: Summary | null }) {
  const ratio = s ? s.soldTotal / s.targetQty : 0;
  const progress = Math.min(100, ratio * 100);
  return (
    <Card title="売上">
      <p className="text-grad text-6xl leading-tight font-black tabular-nums">{s ? yen(s.revenue) : "…"}</p>
      <p className="mt-2 text-4xl font-black tabular-nums">
        {s?.soldTotal ?? "…"}本<span className="text-xl font-bold text-lav-500"> / 目標 {s?.targetQty ?? "…"}本</span>
      </p>
      {/* 進捗バー：マスコットが目標に向かって進む（両端ではみ出さないよう左右に余白） */}
      <div className="mt-4 px-5">
        <div
          className="relative h-5 rounded-full bg-lav-100"
          role="progressbar"
          aria-label="目標に対する販売数"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-linear-to-b from-pink-400 to-magenta transition-[width] duration-700"
            style={{ width: `${progress}%` }}
          />
          <Image
            src="/brand/mascot.png"
            alt=""
            width={477}
            height={454}
            className="absolute top-1/2 w-11 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_2px_2px_rgb(0_0_0/0.25)] transition-[left] duration-700"
            style={{ left: `${progress}%` }}
          />
        </div>
      </div>
      <p className="mt-2 flex justify-between text-base text-lav-500 tabular-nums">
        <span>{ratio >= 1 ? <span className="font-black text-pink-500">目標達成！</span> : `あと ${s ? s.targetQty - s.soldTotal : "…"}本`}</span>
        <span>{Math.round(ratio * 100)}%</span>
      </p>
    </Card>
  );
}

/** レジ締め：釣り銭準備金（保存する）と、数えた現金（この端末だけに覚える）から差額を出す */
function CashCard({
  day,
  s,
  total,
  save,
}: {
  day: string;
  s: Summary | null;
  total: boolean;
  save: (patch: Record<string, unknown>) => Promise<boolean>;
}) {
  const [floatText, setFloatText] = useState<string | null>(null);
  const [counted, changeCounted] = useStoredText(`torico-counted-${day}`);

  const floatValue = floatText === null ? null : parseCount(floatText, 1_000_000);
  const countedValue = parseCount(counted);
  const diff = s && typeof countedValue === "number" ? cashDifference(s.expectedCash, countedValue) : null;

  return (
    <Card title="レジ締め">
      <dl className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 text-lg">
        <dt>釣り銭準備金</dt>
        <dd className="text-right font-black tabular-nums">{s ? yen(s.cashFloat) : "…"}</dd>
        <dt>＋ 売上</dt>
        <dd className="text-right font-black tabular-nums">{s ? yen(s.revenue) : "…"}</dd>
        <dt className="border-t-2 border-dashed border-pink-200 pt-2 font-black">レジ内現金の理論値</dt>
        <dd className="border-t-2 border-dashed border-pink-200 pt-2 text-right text-3xl font-black tabular-nums">
          {s ? yen(s.expectedCash) : "…"}
        </dd>
      </dl>

      {total ? (
        <p className="mt-3 text-base text-lav-500">レジ締めは日ごとに行います。上で「1日目」「2日目」を選んでください</p>
      ) : (
        <div className="mt-4 grid gap-4">
          <form
            className="grid gap-1"
            onSubmit={async (e) => {
              e.preventDefault();
              if (typeof floatValue !== "number") return;
              if (await save({ cashFloat: floatValue })) setFloatText(null);
            }}
          >
            <label htmlFor="float" className="text-base text-lav-500">
              釣り銭準備金を変える（円）
            </label>
            <div className="flex gap-2">
              <input
                id="float"
                inputMode="numeric"
                className={input}
                placeholder={s ? String(s.cashFloat) : ""}
                value={floatText ?? ""}
                onChange={(e) => setFloatText(e.target.value)}
              />
              <button type="submit" disabled={typeof floatValue !== "number"} className="btn-pink min-h-14 w-24 shrink-0 text-xl">
                保存
              </button>
            </div>
          </form>

          <div className="grid gap-1">
            <label htmlFor="counted" className="text-base text-lav-500">
              数えた現金（円）
            </label>
            <input
              id="counted"
              inputMode="numeric"
              className={input}
              placeholder="閉店後に数えた金額"
              value={counted}
              onChange={(e) => changeCounted(e.target.value)}
            />
            {countedValue === undefined && <p className="text-base text-danger">数字だけで入れてください</p>}
          </div>

          {diff && (
            <p
              role="status"
              className={`rounded-[18px] p-3 text-center text-2xl font-black tabular-nums ${
                diff.diff === 0 ? "bg-ok/15 text-ok" : "bg-danger-bg text-danger"
              }`}
            >
              差額 {diff.diff > 0 ? "+" : ""}
              {diff.diff.toLocaleString()}円（{diff.label}）
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/** 販売本数：串 × 味付けの表（SKU別）と、串別・味付け別・全体の合計 */
function BreakdownCard({ s }: { s: Summary | null }) {
  const cell = "py-2 text-right tabular-nums";
  return (
    <Card title="販売本数">
      <table className="w-full text-lg">
        <thead>
          <tr className="text-base text-lav-500">
            <th className="py-1 text-left font-bold">串</th>
            {SEASONINGS.map((x) => (
              <th key={x.id} className={`py-1 text-right font-black ${x.text}`}>
                {x.name}
              </th>
            ))}
            <th className="py-1 text-right font-bold">計</th>
          </tr>
        </thead>
        <tbody>
          {ITEMS.map((item) => (
            <tr key={item.id} className="border-t-2 border-dashed border-pink-200">
              <th scope="row" className="py-2 text-left font-black">
                {item.name}
              </th>
              {SEASONINGS.map((x) => (
                <td key={x.id} className={cell}>
                  {s?.soldBySku[skuKey(item.id, x.id)] ?? "…"}
                </td>
              ))}
              <td className={`${cell} font-black`}>{s?.soldByItem[item.id] ?? "…"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-[3px] border-ink">
            <th scope="row" className="py-2 text-left font-black">
              計
            </th>
            {SEASONINGS.map((x) => (
              <td key={x.id} className={`${cell} font-black`}>
                {s?.soldBySeasoning[x.id] ?? "…"}
              </td>
            ))}
            <td className={`${cell} text-2xl font-black`}>{s?.soldTotal ?? "…"}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

/** 販売上限（串ごと、たれ・塩の合計）と手動の売り切れ（味付けごと） */
function StockCard({
  settings,
  s,
  save,
}: {
  settings: DaySettings;
  s: Summary;
  save: (patch: Record<string, unknown>) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Partial<Record<ItemId, string>>>({});
  const [busy, setBusy] = useState(false);
  const changed = Object.keys(draft) as ItemId[];
  const parsed = Object.fromEntries(changed.map((id) => [id, parseCount(draft[id] ?? "", 99_999)]));
  const invalid = changed.some((id) => parsed[id] === undefined);

  const toggleSoldout = async (key: SkuKey) => {
    setBusy(true);
    const next = settings.soldout.includes(key) ? settings.soldout.filter((k) => k !== key) : [...settings.soldout, key];
    await save({ soldout: next });
    setBusy(false);
  };

  return (
    <Card title="販売上限と売り切れ">
      <p className="mb-3 text-base text-lav-500">上限はたれ・塩の合計です。空にすると上限なし。売り切れボタンは、たれや塩が切れたときに</p>
      <ul className="grid gap-3">
        {ITEMS.map((item) => {
          const cap = settings.capacity[item.id];
          const left = s.remainingByItem[item.id];
          return (
            <li key={item.id} className="rounded-[18px] border-[3px] border-lav-300 bg-lav-100 p-3">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-2xl font-black">{item.name}</span>
                <span className={`text-base font-bold ${left !== null && left <= 0 ? "text-danger" : "text-lav-500"}`}>
                  {left === null ? "上限なし" : `残り ${Math.max(0, left)}本`}・{s.soldByItem[item.id]}本売れた
                </span>
              </p>
              <label className="mt-2 flex items-center gap-2 text-base whitespace-nowrap text-lav-500">
                上限（本）
                <input
                  inputMode="numeric"
                  aria-label={`${item.name}の上限（本）`}
                  className={`${input} h-12 text-xl`}
                  placeholder="なし"
                  value={draft[item.id] ?? (cap === null ? "" : String(cap))}
                  onChange={(e) => setDraft((d) => ({ ...d, [item.id]: e.target.value }))}
                />
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {SEASONINGS.map((x) => {
                  const key = skuKey(item.id, x.id);
                  const on = settings.soldout.includes(key);
                  return (
                    <button
                      key={x.id}
                      type="button"
                      aria-pressed={on}
                      disabled={busy}
                      onClick={() => toggleSoldout(key)}
                      aria-label={`${item.name} ${x.name}：${on ? "売り切れを戻す" : "売り切れにする"}`}
                      className={`min-h-16 rounded-[18px] border-[3px] px-1 text-base leading-tight font-black ${
                        on ? "border-danger bg-danger text-white" : `${x.border} ${x.bg} ${x.text}`
                      }`}
                    >
                      {on ? (
                        <>
                          {x.name} 売り切れ中
                          <br />
                          <span className="text-[15px]">押すと戻す</span>
                        </>
                      ) : (
                        `${x.name}を売り切れに`
                      )}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      {changed.length > 0 && (
        <div className="sticky bottom-3 mt-3 flex gap-2">
          <button type="button" onClick={() => setDraft({})} className="btn-ghost min-h-16 flex-1 text-xl">
            やめる
          </button>
          <button
            type="button"
            disabled={invalid || busy}
            onClick={async () => {
              setBusy(true);
              if (await save({ capacity: parsed })) setDraft({});
              setBusy(false);
            }}
            className="btn-pink min-h-16 flex-[2] text-xl"
          >
            {invalid ? "数字だけで入れてください" : "上限を保存"}
          </button>
        </div>
      )}
    </Card>
  );
}
