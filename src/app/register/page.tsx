import type { Metadata } from "next";
import { RegisterScreen } from "./RegisterScreen";

export const metadata: Metadata = { title: "受付" };

export default function RegisterPage() {
  return <RegisterScreen />;
}
