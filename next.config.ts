import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // LAN内なので画像は最適化せずそのまま配る（ロゴを差し替えたときに古い変換結果が残らないように）
  images: { unoptimized: true },
  // 開発時に LAN 上の別端末からアクセスできるようにする（本番のアクセスポイントは 10.42.0.x）
  allowedDevOrigins: ["192.168.*.*", "172.*.*.*", "10.*.*.*"],
  // 古いブックマーク用：/kitchen は焼き場へ（ブラウザに覚えさせないよう一時的なリダイレクト）
  async redirects() {
    return [{ source: "/kitchen", destination: "/grill", permanent: false }];
  },
};

export default nextConfig;
