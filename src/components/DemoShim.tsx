"use client";

import { install } from "@/lib/demo/install";

if (process.env.NEXT_PUBLIC_TORICO_DEMO === "1" && typeof window !== "undefined") install();

export function DemoShim() {
  return null;
}
