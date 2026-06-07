import type { Metadata } from "next";

export const metadata: Metadata = { title: "Passport" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
