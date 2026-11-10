import Image from "next/image";
import Link from "next/link";

const LINKS = [
  { href: "/register", label: "受付", note: "受付PC（サーバー）" },
  { href: "/kitchen", label: "キッチン", note: "キッチンPC" },
  { href: "/display", label: "呼び出し表示", note: "お客さん向け" },
  { href: "/admin", label: "管理", note: "責任者のスマホ" },
] as const;

export default function Home() {
  return (
    <main className="bg-space flex min-h-dvh flex-1 flex-col items-center justify-center gap-8 px-4 py-8">
      <Image
        src="/brand/logo.jpg"
        alt="やきとり TORI♡CO"
        width={800}
        height={795}
        priority
        className="h-auto w-[min(70vw,20rem)] rounded-[28px] bg-white p-3 shadow-[0_0.5rem_0_rgb(0_0_0/0.35)]"
      />
      <nav aria-label="画面を選ぶ" className="w-full max-w-2xl">
        <ul className="grid gap-4 sm:grid-cols-2">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="press flex min-h-24 flex-col items-center justify-center rounded-3xl bg-white px-6 text-ink shadow-[0_0.4rem_0_rgb(0_0_0/0.3)]"
              >
                <span className="text-3xl font-black">{l.label}</span>
                <span className="text-base text-gray-600">{l.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
