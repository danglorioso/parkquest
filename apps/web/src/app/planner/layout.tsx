import type { Metadata } from "next";

export const metadata: Metadata = { title: "Trip Planner" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
