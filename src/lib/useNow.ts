"use client";

import { useEffect, useState } from "react";

/** 一定間隔で更新される現在時刻（ms）。offsetMs でサーバー時刻に合わせる */
export function useNow(offsetMs = 0, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now + offsetMs;
}
