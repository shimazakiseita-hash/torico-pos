"use client";

import { useState } from "react";
import { pressKey } from "@/lib/register";

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", "00", "back"] as const;

type Props = {
  open: boolean;
  /** 合計金額（不足のときに知らせる） */
  amount: number;
  onDone: (value: number) => void;
  onCancel: () => void;
};

/** 預かり金額のテンキー入力（任意の整数円） */
export function TenkeyDialog({ open, amount, onDone, onCancel }: Props) {
  if (!open) return null;
  return <TenkeyBody amount={amount} onDone={onDone} onCancel={onCancel} />;
}

function TenkeyBody({ amount, onDone, onCancel }: Omit<Props, "open">) {
  const [value, setValue] = useState("");
  const n = value === "" ? null : Number(value);
  const short = n !== null && n < amount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="お預かり金額を入力"
        className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg font-bold">お預かり金額（合計 ¥{amount.toLocaleString()}）</p>
        <p className="my-2 min-h-16 rounded-[18px] bg-lav-100 px-4 text-right text-5xl leading-[4rem] font-black tabular-nums">
          {n === null ? <span className="text-lav-300">¥0</span> : `¥${n.toLocaleString()}`}
        </p>
        <p className={`mb-3 h-6 text-right font-bold ${short ? "text-danger" : "text-transparent"}`}>
          {short ? `あと ¥${(amount - n!).toLocaleString()} 足りません` : "　"}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setValue((v) => pressKey(v, k))}
              aria-label={k === "back" ? "1文字消す" : k}
              className="btn-ghost min-h-16 text-3xl"
            >
              {k === "back" ? "⌫" : k}
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-[1fr_1fr_2fr] gap-3">
          <button type="button" onClick={onCancel} className="btn-ghost min-h-16 text-xl">
            やめる
          </button>
          <button type="button" onClick={() => setValue("")} className="btn-ghost min-h-16 text-xl">
            C
          </button>
          <button type="button" onClick={() => n !== null && onDone(n)} disabled={n === null} className="btn-pink min-h-16 text-2xl">
            決定
          </button>
        </div>
      </div>
    </div>
  );
}
