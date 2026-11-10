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

/** 共通ヘッダー：キャンディ背景の上に、白枠のロゴと画面名、右端に補足と接続状態 */
export function AppHeader({ title, note, error }: Props) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 px-4 text-white">
      <Link href="/" aria-label="トップへ" className="shrink-0">
        <Image
          src="/brand/logo.jpg"
          alt=""
          width={52}
          height={52}
          priority
          className="h-[52px] w-[52px] rounded-xl bg-white p-0.5 shadow-[0_3px_0_rgb(0_0_0/0.15)]"
        />
      </Link>
      <h1 className="text-2xl font-black tracking-wider drop-shadow-[0_2px_0_rgb(0_0_0/0.15)]">{title}</h1>
      {note && <span className="ml-auto rounded-full bg-white/20 px-4 py-1 text-base font-bold">{note}</span>}
      <ConnectionStatus error={error} className={note ? "" : "ml-auto"} />
    </header>
  );
}

/** ●接続中／●接続エラー（色だけでなく文字でも伝える） */
export function ConnectionStatus({ error, className = "" }: { error: boolean | null; className?: string }) {
  const label = error === null ? "接続中…" : error ? "接続エラー" : "接続中";
  const dot = error === null ? "bg-lav-300" : error ? "bg-danger animate-pulse" : "bg-ok";
  return (
    <span
      role="status"
      className={`flex items-center gap-2 rounded-full px-3 py-1 text-base font-bold ${
        error ? "bg-white text-danger" : "bg-white/20 text-white"
      } ${className}`}
    >
      <span className={`inline-block h-3 w-3 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}
