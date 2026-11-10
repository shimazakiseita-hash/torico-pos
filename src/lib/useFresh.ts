"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ids に初めて現れたものを ms ミリ秒のあいだ返す（画面を開いた時点のもの、「戻す」で戻ってきたものは対象外）。
 * onFresh は新しいものが来たときに1回呼ぶ（音を鳴らすなど）
 */
export function useFresh(ids: readonly number[] | null, ms = 6000, onFresh?: () => void): Set<number> {
  const known = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const callback = useRef(onFresh);
  useEffect(() => {
    callback.current = onFresh;
  });
  const key = ids === null ? null : ids.join(",");

  useEffect(() => {
    if (key === null) return;
    const list = key ? key.split(",").map(Number) : [];
    if (known.current === null) {
      known.current = new Set(list);
      return;
    }
    const added = list.filter((id) => !known.current!.has(id));
    for (const id of added) known.current.add(id);
    if (added.length === 0) return;
    callback.current?.();
    setFresh((s) => new Set([...s, ...added]));
    // 続けて別のものが来ても消えるよう、タイマーは effect のやり直しで止めない
    timers.current.push(setTimeout(() => setFresh((s) => new Set([...s].filter((id) => !added.includes(id)))), ms));
  }, [key, ms]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  return fresh;
}
