/** 画面を消さない設定がまだのとき、下に出す案内（どこかを1回タップすれば消える） */
export function KioskBar({ awake, sound = false }: { awake: boolean; sound?: boolean }) {
  if (awake) return null;
  return (
    <p
      role="status"
      className="fixed inset-x-0 bottom-0 z-40 bg-beak px-4 py-3 text-center text-xl font-black text-ink shadow-[0_-0.25rem_0_rgb(0_0_0/0.15)]"
    >
      画面をどこか1回タップしてください（画面が消えないようにします{sound ? "・新しい注文の音が鳴ります" : ""}）
    </p>
  );
}
