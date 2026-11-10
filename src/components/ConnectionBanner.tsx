export function ConnectionBanner({ error }: { error: boolean }) {
  if (!error) return null;
  return (
    <div role="alert" className="sticky top-0 z-40 bg-danger px-4 py-3 text-center text-lg font-bold text-white">
      接続エラー：サーバーにつながりません（最後に取得した内容を表示中）
    </div>
  );
}
