"use client";

import { useState } from "react";
import { setOrderStatus } from "./client";
import type { OrderStatus } from "./status";
import type { Order } from "./types";

/** 注文の状態を変えるボタン用。送信中の注文は押せないようにし、失敗したら onError で知らせる */
export function useMove(refresh: () => Promise<void>, onError: (message: string) => void) {
  const [pending, setPending] = useState<Set<number>>(new Set());

  async function move(order: Order, to: OrderStatus) {
    if (pending.has(order.id)) return;
    setPending((s) => new Set(s).add(order.id));
    const res = await setOrderStatus(order.id, to);
    if (!res.ok) onError(res.error);
    await refresh();
    setPending((s) => {
      const next = new Set(s);
      next.delete(order.id);
      return next;
    });
  }

  return { move, isPending: (o: Order) => pending.has(o.id) };
}
