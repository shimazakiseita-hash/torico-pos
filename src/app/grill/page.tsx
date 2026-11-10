import type { Metadata } from "next";
import { GrillScreen } from "./GrillScreen";

export const metadata: Metadata = { title: "焼き場" };

export default function GrillPage() {
  return <GrillScreen />;
}
