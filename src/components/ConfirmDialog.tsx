"use client";

import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 取り消し系の操作だけに使う確認ダイアログ */
export function ConfirmDialog({ open, title, children, confirmLabel, busy, onConfirm, onCancel }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-2xl font-bold">{title}</h2>
        <div className="mb-6 text-lg">{children}</div>
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-16 rounded-2xl border-2 border-gray-400 bg-white text-xl font-bold active:bg-gray-100"
          >
            やめる
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-16 rounded-2xl bg-danger text-xl font-bold text-white active:brightness-90 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
