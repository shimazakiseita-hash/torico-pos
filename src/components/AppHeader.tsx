import Image from "next/image";
import Link from "next/link";

type Props = {
  /** 画面名（「受付」「焼き場」など） */
  title: string;
  /** 右上に出す補足（営業日など） */
  note?: string;
  /** 通信エラー中なら true。まだ一度も取得していない間は null */
  error: boolean | null;
};

/** 共通ヘッダー：紺の帯に小さいロゴと画面名、右端に接続状態 */
export function AppHeader({ title, note, error }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 bg-space-700 px-3 text-white shadow-md">
      <Link href="/" className="flex items-center gap-2" aria-label="トップへ">
        <Image src="/brand/mascot.jpg" alt="" width={40} height={40} className="rounded-full bg-white" priority />
        <span className="hidden text-sm font-bold leading-tight sm:block">
          やきとり
          <br />
          TORI♡CO
        </span>
      </Link>
      <h1 className="ml-1 border-l-2 border-white/30 pl-3 text-2xl font-black">{title}</h1>
      {note && <span className="ml-auto rounded-full bg-white/15 px-3 py-1 text-base font-bold">{note}</span>}
      <ConnectionStatus error={error} className={note ? "" : "ml-auto"} />
    </header>
  );
}

/** ●接続中／●接続エラー（色だけでなく文字でも伝える） */
export function ConnectionStatus({ error, className = "" }: { error: boolean | null; className?: string }) {
  const label = error === null ? "接続中…" : error ? "接続エラー" : "接続中";
  const dot = error === null ? "bg-gray-300" : error ? "bg-red-500 animate-pulse" : "bg-emerald-400";
  return (
    <span
      role="status"
      className={`flex items-center gap-2 rounded-full px-3 py-1 text-base font-bold ${
        error ? "bg-white text-danger" : "bg-white/10 text-white"
      } ${className}`}
    >
      <span className={`inline-block h-3 w-3 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}
