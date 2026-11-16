"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { STORAGE_KEY } from "@/lib/demo/constants";
import type { ServerInfo } from "@/lib/serverInfo";

/** 練習モード（npm run practice）で起動中は、すべての画面の上に帯を出して本番と見分ける */
export function PracticeBanner() {
  const demo = process.env.NEXT_PUBLIC_TORICO_DEMO === "1";
  const [confirm, setConfirm] = useState(false);
  const [practice, setPractice] = useState(false);

  useEffect(() => {
    fetch("/api/server-info", { cache: "no-store" })
      .then((res) => res.json() as Promise<ServerInfo>)
      .then((info) => setPractice(info.practice))
      .catch(() => {});
  }, []);

  if (demo) return (
    <>
      <div role="status" className="flex shrink-0 items-center justify-center gap-2 bg-beak px-2 py-1 text-center text-sm font-black whitespace-nowrap text-ink">
        練習版（データはこのスマホだけ）
        <button type="button" className="min-h-11 shrink-0 px-1 text-xs underline" onClick={() => setConfirm(true)}>練習データを消す</button>
      </div>
      <ConfirmDialog open={confirm} title="練習データを消しますか？" confirmLabel="消す" onCancel={() => setConfirm(false)} onConfirm={() => {
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
        window.location.reload();
      }}>このスマホに保存した練習用の注文と設定をすべて消します。</ConfirmDialog>
    </>
  );

  if (!practice) return null;
  return (
    <p role="status" className="shrink-0 bg-beak px-3 py-1 text-center text-base font-black text-ink">
      練習モード：ここでの注文は本番のデータに残りません
    </p>
  );
}
