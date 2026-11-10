import type { Metadata, Viewport } from "next";
import { PracticeBanner } from "@/components/PracticeBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "やきとり TORI♡CO", template: "%s｜やきとり TORI♡CO" },
  description: "津田沼祭 焼き鳥屋台の注文・会計",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <PracticeBanner />
        {children}
      </body>
    </html>
  );
}
