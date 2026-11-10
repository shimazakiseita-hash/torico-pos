"use client";

import { useCallback, useEffect, useState } from "react";

/** 画面下に数秒だけ出るメッセージ */
export function useToast(durationMs = 4000) {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs]);
  const show = useCallback((m: string) => setMessage(m), []);
  return { message, show, clear: () => setMessage(null) };
}

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;
  return (
    <button
      type="button"
      onClick={onClose}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-2xl bg-space-900 px-6 py-4 text-left text-lg font-bold text-white shadow-2xl"
    >
      {message}
    </button>
  );
}
