"use client";

import { useEffect, useState } from "react";
import type { ServerInfo } from "@/lib/serverInfo";

/** 練習モード（npm run practice）で起動中は、すべての画面の上に帯を出して本番と見分ける */
export function PracticeBanner() {
  const [practice, setPractice] = useState(false);

  useEffect(() => {
    fetch("/api/server-info", { cache: "no-store" })
      .then((res) => res.json() as Promise<ServerInfo>)
      .then((info) => setPractice(info.practice))
      .catch(() => {});
  }, []);

  if (!practice) return null;
  return (
    <p role="status" className="shrink-0 bg-beak px-3 py-1 text-center text-base font-black text-ink">
      練習モード：ここでの注文は本番のデータに残りません
    </p>
  );
}
