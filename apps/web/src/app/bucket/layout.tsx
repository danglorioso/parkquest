import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bucket List" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
