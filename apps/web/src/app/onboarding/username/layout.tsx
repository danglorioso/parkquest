import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create Username" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
