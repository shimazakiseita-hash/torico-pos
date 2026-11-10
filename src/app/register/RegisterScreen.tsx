"use client";

import Image from "next/image";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { KioskBar } from "@/components/KioskBar";
import { ItemBadges, itemsText } from "@/components/ItemBadges";
import { Toast, useToast } from "@/components/Toast";
import { sendJson, setOrderStatus } from "@/lib/client";
import { SKUS, emptySkuCounts, skuName, SEASONING_BY_ID, type SkuCounts, type SkuKey } from "@/lib/menu";
import { MAX_ORDER_QTY, calcAmount } from "@/lib/pricing";
import { STATUS_LABELS } from "@/lib/status";
import { sum } from "@/lib/summary";
import type { CreatedOrder, Order } from "@/lib/types";
import { useKiosk } from "@/lib/useKiosk";
import { usePolling } from "@/lib/usePolling";

const RECENT_COUNT = 5;

export function RegisterScreen() {
  const orders = usePolling<Order[]>("/api/orders");
  const toast = useToast();
  const kiosk = useKiosk();

  const [cart, setCart] = useState<SkuCounts>(emptySkuCounts);
  const [submitting, setSubmitting] = useState(false);
  const [issued, setIssued] = useState<CreatedOrder | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const totalQty = sum(cart);
  const amount = calcAmount(totalQty);

  const add = (key: SkuKey) => setCart((c) => ({ ...c, [key]: c[key] + 1 }));
  const sub = (key: SkuKey) => setCart((c) => ({ ...c, [key]: Math.max(0, c[key] - 1) }));
  const clear = () => setCart(emptySkuCounts());

  async function submit() {
    if (submitting || totalQty === 0) return;
    setSubmitting(true);
    const items = SKUS.filter((s) => cart[s.key] > 0).map((s) => ({ item: s.item, seasoning: s.seasoning, qty: cart[s.key] }));
    // 預かり金額の入力はフェーズ2で作る。それまでは「ちょうど」で確定する
    const res = await sendJson<CreatedOrder>("POST", "/api/orders", { items, tendered: amount });
    setSubmitting(false);
    if (res.ok) {
      setIssued(res.data);
    } else {
      toast.show(res.error);
    }
    orders.refresh();
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
    if (!res.ok) toast.show(res.error);
    else toast.show(`${cancelTarget.number}番を取り消しました`);
    orders.refresh();
  }

  const recent = (orders.data ?? []).slice(-RECENT_COUNT).reverse();

  if (issued) {
    const label = String(issued.number);
    return (
      <main className="bg-space flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center text-white">
        <p className="text-4xl font-black tracking-wider">呼び出し番号</p>
        <div className="relative w-[min(52vh,78vw)]">
          <div className="issued-tile">
            <div className="issued-number tabular-nums" data-digits={label.length}>
              {label}
            </div>
          </div>
          <Image
            src="/brand/mascot.jpg"
            alt=""
            width={549}
            height={526}
            className="drift absolute -right-[22%] -bottom-[4%] w-[38%] rounded-full shadow-[0_0.4rem_0_rgb(0_0_0/0.3)]"
          />
        </div>
        <p className="text-3xl font-bold">
          {issued.amount.toLocaleString()}円（お釣り {issued.changeDue.toLocaleString()}円）
        </p>
        <button
          type="button"
          autoFocus
          onClick={next}
          className="press min-h-24 w-full max-w-xl rounded-3xl bg-white text-4xl font-black text-ink shadow-[0_0.4rem_0_rgb(0_0_0/0.3)]"
        >
          次のお客さん
        </button>
      </main>
    );
  }

  return (
    <>
      <AppHeader title="レジ" error={orders.status} />
      <ConnectionBanner error={orders.error} />
      <main className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[3fr_2fr]">
        <section className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            {SKUS.map((sku) => {
              const canAdd = totalQty < MAX_ORDER_QTY;
              const name = skuName(sku.item, sku.seasoning);
              const se = SEASONING_BY_ID[sku.seasoning];
              return (
                <div key={sku.key} className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => add(sku.key)}
                    disabled={!canAdd}
                    aria-label={`${name}を1本追加`}
                    className={`press flex min-h-16 flex-1 items-center justify-between rounded-2xl border-2 px-4 text-left disabled:opacity-40 ${se.bg} ${se.text} ${se.border}`}
                  >
                    <span className="text-2xl font-black">{name}</span>
                    <span key={cart[sku.key]} className={`text-4xl font-black tabular-nums ${cart[sku.key] > 0 ? "pop" : "opacity-40"}`}>
                      {cart[sku.key]}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => sub(sku.key)}
                    disabled={cart[sku.key] === 0}
                    className={`press min-h-16 w-16 rounded-2xl border-2 bg-white text-3xl font-black text-ink active:bg-gray-100 disabled:opacity-30 ${se.border}`}
                    aria-label={`${name}を1本減らす`}
                  >
                    −
                  </button>
                </div>
              );
            })}
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-xl font-bold text-ink">直近の注文</h2>
            {recent.length === 0 ? (
              <p className="text-lg text-gray-500">まだ注文はありません</p>
            ) : (
              <ul className="divide-y">
                {recent.map((o) => (
                  <li key={o.id} className="flex min-h-16 items-center gap-4 py-2">
                    <span className="w-16 text-3xl font-black tabular-nums">{o.number}</span>
                    <span className="flex-1">
                      <ItemBadges items={o.items} size="sm" />
                    </span>
                    <span className="text-lg tabular-nums">{o.amount}円</span>
                    <span className={`w-28 text-center text-lg font-bold ${o.status === "cancelled" ? "text-gray-400 line-through" : ""}`}>
                      {STATUS_LABELS[o.status]}
                    </span>
                    {o.status === "waiting" ? (
                      <button
                        type="button"
                        onClick={() => setCancelTarget(o)}
                        className="min-h-16 w-28 rounded-2xl border-2 border-danger text-lg font-bold text-danger active:bg-red-50"
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
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-[0_0.3rem_1rem_rgb(0_0_0/0.08)] lg:sticky lg:top-4 lg:self-start">
          <h2 className="text-2xl font-black text-ink">ご注文</h2>
          <ul className="min-h-28 space-y-1 text-2xl">
            {SKUS.filter((sku) => cart[sku.key] > 0).map((sku) => (
              <li key={sku.key} className="flex items-center gap-3">
                <span className="flex-1 font-bold">{skuName(sku.item, sku.seasoning)}</span>
                <span className="tabular-nums">× {cart[sku.key]}</span>
              </li>
            ))}
            {totalQty === 0 && <li className="text-gray-500">串のボタンを押してください</li>}
          </ul>
          <div className="flex items-baseline justify-between border-t-2 border-lav-100 pt-4 text-2xl">
            <span>
              合計 <span className="font-black tabular-nums">{totalQty}</span>本
              {totalQty >= MAX_ORDER_QTY && <span className="ml-2 text-base font-bold text-danger">（上限）</span>}
            </span>
            <span className="text-4xl font-black tabular-nums">{amount.toLocaleString()}円</span>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={totalQty === 0 || submitting}
            className="press min-h-24 w-full rounded-3xl bg-danger text-4xl font-black text-white shadow-[0_0.3rem_0_rgb(0_0_0/0.25)] disabled:opacity-40"
          >
            {submitting ? "送信中…" : "確定"}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={totalQty === 0 || submitting}
            className="press min-h-16 rounded-2xl border-2 border-gray-400 text-2xl font-bold active:bg-gray-100 disabled:opacity-30"
          >
            クリア
          </button>
        </section>
      </main>

      <ConfirmDialog
        open={cancelTarget !== null}
        title={`${cancelTarget?.number}番を取り消しますか？`}
        confirmLabel="取り消す"
        busy={cancelling}
        onConfirm={cancelOrder}
        onCancel={() => setCancelTarget(null)}
      >
        {cancelTarget && (
          <>
            <p>{itemsText(cancelTarget.items)}（{cancelTarget.amount}円）</p>
            <p className="mt-2 font-bold text-danger">{cancelTarget.amount.toLocaleString()}円をお客さんに返してください。</p>
          </>
        )}
      </ConfirmDialog>
      <Toast message={toast.message} onClose={toast.clear} />
      <KioskBar awake={kiosk.awake} />
    </>
  );
}
