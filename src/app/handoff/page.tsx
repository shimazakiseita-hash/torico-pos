import type { Metadata } from "next";
import { HandoffScreen } from "./HandoffScreen";

export const metadata: Metadata = { title: "渡し場" };

export default function HandoffPage() {
  return <HandoffScreen />;
}
