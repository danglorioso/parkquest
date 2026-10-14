"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { PublicNav, PUBLIC_NAV_HEIGHT } from "@/components/public/PublicNav";
import type { MapPark } from "@/components/USAMapGL";

const USAMap = dynamic(() => import("@/components/USAMapGL"), {
  ssr: false,
  loading: () => <div className="h-full w-full" style={{ background: "#CECDBC" }} />,
});

interface PublicPark {
  park_code: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
  is_national_park: boolean;
}

// Signed-out map: every park, no visit state. Tapping a park opens its public
// page; the sign-up banner matches the park pages.
export function PublicMapView() {
  const router = useRouter();
  const [parks, setParks] = useState<MapPark[]>([]);

  useEffect(() => {
    fetch("/api/parks")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PublicPark[]) => {
        setParks(
          data
            .filter((p) => p.latitude && p.longitude)
            .map((p) => ({
              park_code: p.park_code,
              name: p.name,
              position: [parseFloat(p.latitude!), parseFloat(p.longitude!)] as [number, number],
              status: "notVisited" as const,
              is_national_park: p.is_national_park,
            }))
        );
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <PublicNav active="map" redirectTo="/map" />

      <div style={{ position: "relative", height: `calc(100vh - ${PUBLIC_NAV_HEIGHT}px)`, background: "#CECDBC", overflow: "hidden" }}>
        <USAMap
          className="h-full w-full"
          parks={parks}
          onSelectPark={(code) => router.push(`/parks/${code}`)}
        />
      </div>

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
        background: "var(--primary)", padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#FFFBF1" }}>
            Log your visits on the map
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,251,241,0.75)", marginTop: 2 }}>
            Track every national park you&apos;ve been to and earn badges along the way.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Link href="/sign-in?redirect=%2Fmap" style={{ textDecoration: "none" }}>
            <button style={{
              background: "rgba(255,251,241,0.15)", border: "1px solid rgba(255,251,241,0.35)",
              borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600,
              color: "#FFFBF1", cursor: "pointer",
            }}>Sign in</button>
          </Link>
          <Link href="/sign-up" style={{ textDecoration: "none" }}>
            <button style={{
              background: "#FFFBF1", border: "none",
              borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700,
              color: "var(--primary)", cursor: "pointer",
            }}>Create free account</button>
          </Link>
        </div>
      </div>
    </div>
  );
}
