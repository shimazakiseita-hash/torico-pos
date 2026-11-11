"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Heart } from "@/components/Heart";
import { ItemBadges, itemsText } from "@/components/ItemBadges";
import { KioskBar } from "@/components/KioskBar";
import { TenkeyDialog } from "@/components/TenkeyDialog";
import { Toast, useToast } from "@/components/Toast";
import { dayLabel } from "@/lib/businessDay";
import { sendJson, setOrderStatus } from "@/lib/client";
import { ITEMS, SEASONINGS, SEASONING_BY_ID, SKUS, UNIT_PRICE, emptySkuCounts, skuKey, skuName, type SkuCounts, type SkuKey } from "@/lib/menu";
import { MAX_ORDER_QTY } from "@/lib/pricing";
import { TENDER_PRESETS, availability, cartItems, checkout, type SkuAvailability, type Tender } from "@/lib/register";
import { STATUS_LABELS } from "@/lib/status";
import { sum, type Summary } from "@/lib/summary";
import type { CreatedOrder, Order } from "@/lib/types";
import { useKiosk } from "@/lib/useKiosk";
import { usePolling } from "@/lib/usePolling";

const RECENT_COUNT = 5;
const LONG_PRESS_MS = 500;

const yen = (n: number) => `¥${n.toLocaleString()}`;

export function RegisterScreen() {
  const orders = usePolling<Order[]>("/api/orders");
  const summary = usePolling<Summary>("/api/summary");
  const toast = useToast();
  const kiosk = useKiosk();

  const [cart, setCart] = useState<SkuCounts>(emptySkuCounts);
  const [tender, setTender] = useState<Tender>(null);
  const [tenkeyOpen, setTenkeyOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const sending = useRef(false);
  const [issued, setIssued] = useState<CreatedOrder | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const totalQty = sum(cart);
  const co = checkout(cart, tender);
  const avail = availability(cart, summary.data?.remainingByItem ?? {}, summary.data?.soldOut ?? []);
  const connError = orders.error || summary.error;

  const add = (key: SkuKey) => {
    if (avail[key].canAdd) setCart((c) => ({ ...c, [key]: c[key] + 1 }));
  };
  const sub = (key: SkuKey) => setCart((c) => ({ ...c, [key]: Math.max(0, c[key] - 1) }));
  const clear = () => {
    setCart(emptySkuCounts());
    setTender(null);
  };

  async function submit() {
    if (sending.current || co.state !== "ok") return;
    sending.current = true;
    setSubmitting(true);
    const res = await sendJson<CreatedOrder>("POST", "/api/orders", { items: cartItems(cart), tendered: co.tendered });
    sending.current = false;
    setSubmitting(false);
    if (res.ok) setIssued(res.data);
    else toast.show(res.error);
    void orders.refresh();
    void summary.refresh();
  }

  function next() {
    setIssued(null);
    clear();
  }

  async function cancelOrder() {
    if (!cancelTarget) return;
    setCancelling(true);
    const res = await setOrderStatus(cancelTarget.id, "cancelled");
    setCancelling(false);
    setCancelTarget(null);
    toast.show(res.ok ? `${cancelTarget.number}番を取り消しました` : res.error);
    void orders.refresh();
    void summary.refresh();
  }

  if (issued) return <IssuedView order={issued} onNext={next} />;

  const recent = (orders.data ?? []).slice(-RECENT_COUNT).reverse();
  const tenderIs = (t: Tender) => JSON.stringify(t) === JSON.stringify(tender);

  return (
    <div className="bg-candy min-h-dvh">
      {/* 1画面目：ヘッダー・赤帯・入力と会計で画面の高さちょうど（直近の注文はその下） */}
      <div className="flex flex-col lg:h-dvh">
        <AppHeader title="受付" note={summary.data ? dayLabel(summary.data.businessDay) : undefined} error={orders.status} />
        <ConnectionBanner error={connError} />
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_26rem]">
          {/* 串5種 × 味付け2種 */}
          <section aria-label="品目" className="flex flex-col gap-2.5 panel p-4">
            {ITEMS.map((item) => (
              <div key={item.id} className="grid min-h-16 flex-1 grid-cols-[9.5rem_1fr_1fr] gap-2.5">
                <div className="flex items-center text-[1.75rem] font-black whitespace-nowrap">
                  <span className="mr-2 text-pink-200" aria-hidden>
                    ♥
                  </span>
                  <span className="flex flex-col leading-tight">
                    {item.name}
                    {avail[skuKey(item.id, "tare")].remaining !== null && (
                      <small className="text-sm font-bold text-lav-500">残{Math.max(0, avail[skuKey(item.id, "tare")].remaining!)}</small>
                    )}
                  </span>
                </div>
                {SEASONINGS.map((s) => {
                  const key = skuKey(item.id, s.id);
                  return (
                    <SkuCell
                      key={key}
                      skuKey={key}
                      count={cart[key]}
                      avail={avail[key]}
                      onAdd={() => add(key)}
                      onSub={() => sub(key)}
                    />
                  );
                })}
              </div>
            ))}
            <p className="text-sm text-lav-500">タップで＋1本、長押しか「−」で−1本</p>
          </section>

          {/* 会計 */}
          <aside aria-label="会計" className="flex flex-col gap-2.5 panel p-4">
            <ul className="min-h-0 flex-1 overflow-y-auto text-xl">
              {SKUS.filter((s) => cart[s.key] > 0).map((s) => (
                <li key={s.key} className="flex justify-between border-b-2 border-dashed border-pink-200 py-1">
                  <span>
                    {skuName(s.item, s.seasoning)} ×{cart[s.key]}
                  </span>
                  <span className="tabular-nums">{(cart[s.key] * UNIT_PRICE).toLocaleString()}</span>
                </li>
              ))}
              {totalQty === 0 && <li className="text-lav-500">串のボタンを押してください</li>}
            </ul>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl">
                {totalQty}本{totalQty >= MAX_ORDER_QTY && <span className="ml-1 text-base text-danger">（上限）</span>}
              </span>
              <span className="text-grad text-7xl leading-none font-black tabular-nums">{yen(totalQty * UNIT_PRICE)}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <TenderButton active={tenderIs({ kind: "exact" })} disabled={totalQty === 0} onClick={() => setTender({ kind: "exact" })}>
                ちょうど
              </TenderButton>
              {TENDER_PRESETS.map((v) => (
                <TenderButton
                  key={v}
                  active={tenderIs({ kind: "amount", value: v })}
                  disabled={totalQty === 0}
                  onClick={() => setTender({ kind: "amount", value: v })}
                >
                  {yen(v)}
                </TenderButton>
              ))}
              <TenderButton
                active={tender?.kind === "amount" && !(TENDER_PRESETS as readonly number[]).includes(tender.value)}
                disabled={totalQty === 0}
                onClick={() => setTenkeyOpen(true)}
              >
                テンキー
              </TenderButton>
              <button type="button" onClick={clear} disabled={totalQty === 0 || submitting} className="btn-ghost min-h-16 text-xl">
                クリア
              </button>
            </div>

            <ChangePanel co={co} />

            <button
              type="button"
              onClick={submit}
              disabled={co.state !== "ok" || submitting}
              className="btn-ok min-h-[5.25rem] text-3xl"
            >
              {submitting ? "送信中…" : "会計確定 → 番号発行"}
            </button>
          </aside>
        </main>
      </div>

      <section aria-labelledby="recent-h" className="mx-4 mb-4 panel p-4">
        <h2 id="recent-h" className="mb-2 text-xl font-black">
          <Heart />
          直近の注文
        </h2>
        {recent.length === 0 ? (
          <p className="text-lg text-lav-500">まだ注文はありません</p>
        ) : (
          <ul className="divide-y-2 divide-dashed divide-pink-200">
            {recent.map((o) => (
              <li key={o.id} className="flex min-h-20 items-center gap-4 py-2">
                <span className="w-16 text-4xl font-black tabular-nums">{o.number}</span>
                <span className="flex-1">
                  <ItemBadges items={o.items} size="sm" />
                </span>
                <span className="w-24 text-right text-lg tabular-nums">{yen(o.amount)}</span>
                <span className={`w-28 text-center text-lg font-bold ${o.status === "cancelled" ? "text-lav-300 line-through" : ""}`}>
                  {STATUS_LABELS[o.status]}
                </span>
                {o.status === "waiting" ? (
                  <button
                    type="button"
                    onClick={() => setCancelTarget(o)}
                    className="min-h-16 w-28 rounded-[18px] border-[3px] border-danger bg-white text-lg font-bold text-danger active:bg-danger-bg"
                  >
                    取り消し
                  </button>
                ) : (
                  <span className="w-28" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <TenkeyDialog
        open={tenkeyOpen}
        amount={totalQty * UNIT_PRICE}
        onDone={(value) => {
          setTender({ kind: "amount", value });
          setTenkeyOpen(false);
        }}
        onCancel={() => setTenkeyOpen(false)}
      />
      <ConfirmDialog
        open={cancelTarget !== null}
        title={`${cancelTarget?.number}番を取り消しますか？`}
        confirmLabel="取り消して返金"
        busy={cancelling}
        onConfirm={cancelOrder}
        onCancel={() => setCancelTarget(null)}
      >
        {cancelTarget && (
          <>
            <p>{itemsText(cancelTarget.items)}</p>
            <p className="mt-3 text-3xl font-black text-danger">返金 {yen(cancelTarget.amount)}</p>
            <p className="mt-2 font-bold">お客さんにお金を返し、{cancelTarget.number}番の整理券を受け取って捨ててください。</p>
          </>
        )}
      </ConfirmDialog>
      <Toast message={toast.message} onClose={toast.clear} />
      <KioskBar awake={kiosk.awake} />
    </div>
  );
}

/** SKUのボタン。タップで＋1、長押しで−1。右の「−」でも−1 */
function SkuCell({
  skuKey: key,
  count,
  avail,
  onAdd,
  onSub,
}: {
  skuKey: SkuKey;
  count: number;
  avail: SkuAvailability;
  onAdd: () => void;
  onSub: () => void;
}) {
  const sku = SKUS.find((s) => s.key === key)!;
  const s = SEASONING_BY_ID[sku.seasoning];
  const name = skuName(sku.item, sku.seasoning);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const startPress = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      if (count > 0) onSub();
    }, LONG_PRESS_MS);
  };
  const endPress = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const dim = avail.soldOut && count === 0;

  return (
    <div className={`flex min-h-16 overflow-hidden rounded-[18px] border-[3px] ${s.border} ${s.bg} ${s.text} ${dim ? "opacity-35" : ""}`}>
      <button
        type="button"
        disabled={!avail.canAdd && count === 0}
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onPointerCancel={endPress}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (longPressed.current) longPressed.current = false;
          else onAdd();
        }}
        aria-label={`${name}を1本追加`}
        className="press flex flex-1 items-center justify-between gap-2 px-4 text-left select-none"
      >
        <span className="text-2xl font-black">
          {s.name}
          <small className="ml-2 text-sm font-bold opacity-80">
            {avail.soldOut ? "売り切れ" : ""}
          </small>
        </span>
        <span
          key={count}
          className={`min-w-14 rounded-full bg-white text-center text-3xl leading-[3rem] font-black tabular-nums ${count > 0 ? "pop" : "opacity-60"}`}
        >
          {dim ? "-" : count}
        </span>
      </button>
      <button
        type="button"
        onClick={onSub}
        disabled={count === 0}
        aria-label={`${name}を1本減らす`}
        className={`w-14 shrink-0 border-l-[3px] bg-white/60 text-3xl font-black disabled:opacity-30 ${s.border}`}
      >
        −
      </button>
    </div>
  );
}

function TenderButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`min-h-16 text-xl ${active ? "btn-pink" : "btn-ghost"}`}
    >
      {children}
    </button>
  );
}

/** お預かりとお釣り。お釣りは特大で */
function ChangePanel({ co }: { co: ReturnType<typeof checkout> }) {
  let left: React.ReactNode;
  let right: React.ReactNode = null;
  if (co.state === "empty") left = "串を選んでください";
  else if (co.state === "needTender") left = "お預かり金額を選んでください";
  else if (co.state === "short") {
    left = (
      <>
        お預かり {yen(co.tendered)}
        <br />
        <span className="text-danger">あと {yen(co.short)} 足りません</span>
      </>
    );
    right = <b className="text-4xl text-danger">不足</b>;
  } else {
    left = (
      <>
        お預かり {yen(co.tendered)}
        <br />
        お釣り
      </>
    );
    right = <b className="text-6xl leading-none text-danger tabular-nums">{yen(co.change)}</b>;
  }
  return (
    <div aria-live="polite" className="flex min-h-24 items-center justify-between gap-2 rounded-[18px] bg-pink-100 px-4 py-2 text-xl">
      <span>{left}</span>
      {right}
    </div>
  );
}

/** 番号発行後：番号とお釣りを画面いっぱいに */
function IssuedView({ order, onNext }: { order: CreatedOrder; onNext: () => void }) {
  const label = String(order.number);
  return (
    <main className="bg-space flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 p-6 text-center text-white">
      <div className="flex flex-col items-center gap-8 lg:flex-row lg:gap-14">
        <div>
          <p className="mb-4 text-4xl font-black tracking-wider">呼び出し番号</p>
          <div className="relative w-[min(36vh,60vw)]">
            <div className="issued-tile">
              <div className="issued-number tabular-nums" data-digits={label.length}>
                {label}
              </div>
            </div>
            <Image
              src="/brand/mascot.png"
              alt=""
              width={477}
              height={454}
              className="drift absolute -right-[22%] -bottom-[10%] w-[40%] drop-shadow-[0_0.4rem_0_rgb(0_0_0/0.3)]"
            />
          </div>
        </div>
        <div className="rounded-[28px] bg-white px-10 py-6 text-ink shadow-[0_6px_0_rgb(0_0_0/0.25)]">
          <p className="text-3xl font-black">お釣り</p>
          <p className="text-[7rem] leading-none font-black text-danger tabular-nums">
            {order.changeDue === 0 ? "なし" : yen(order.changeDue)}
          </p>
          <p className="mt-3 text-xl">
            お会計 {yen(order.amount)} ／ お預かり {yen(order.tendered)}
          </p>
        </div>
      </div>
      <p className="text-3xl font-bold">
        整理券 <b className="text-5xl text-cyan">{label}番</b> をお渡しください
      </p>
      <button type="button" autoFocus onClick={onNext} className="btn-pink min-h-24 w-full max-w-xl text-4xl">
        次のお客さん
      </button>
    </main>
  );
}
