"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { PublicNav, PUBLIC_NAV_HEIGHT } from "@/components/public/PublicNav";
import { MapRightPanel } from "@/components/desktop/MapRightPanel";
import type { MapPark } from "@/components/USAMapGL";

const USAMap = dynamic(() => import("@/components/USAMapGL"), {
  ssr: false,
  loading: () => <div className="h-full w-full" style={{ background: "#CECDBC" }} />,
});

interface PublicPark {
  park_code: string;
  name: string;
  states: string;
  description: string | null;
  image_url: string | null;
  latitude: string | null;
  longitude: string | null;
  is_national_park: boolean;
}

// Signed-out map: every park, no visit state. Tapping a park opens the same
// side panel as the signed-in map (MapRightPanel in guest mode) so visitors can
// browse park to park; the panel links on to the full park page. Selection
// lives in ?park= like the signed-in map, so a shared link opens that park —
// and sign-in goes through /sign-in?redirect=, which lands back on it.
export function PublicMapView() {
  const router = useRouter();
  const [parks, setParks] = useState<PublicPark[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<{ coords: [number, number]; rightPadding: number } | null>(null);
  const initialCodeRef = useRef<string | null>(null);

  useEffect(() => {
    initialCodeRef.current = new URLSearchParams(window.location.search).get("park");
    fetch("/api/parks")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PublicPark[]) => {
        const located = data.filter((p) => p.latitude && p.longitude);
        setParks(located);
        // Fly to a ?park= deep link once the parks are in (never on dot clicks)
        const initial = located.find((p) => p.park_code === initialCodeRef.current);
        if (initial) {
          setSelectedCode(initial.park_code);
          setFlyToTarget({ coords: [parseFloat(initial.latitude!), parseFloat(initial.longitude!)], rightPadding: 376 });
        }
      })
      .catch(() => {});
  }, []);

  const mapParks: MapPark[] = useMemo(() => parks.map((p) => ({
    park_code: p.park_code,
    name: p.name,
    position: [parseFloat(p.latitude!), parseFloat(p.longitude!)] as [number, number],
    status: "notVisited" as const,
    is_national_park: p.is_national_park,
  })), [parks]);

  const select = (code: string) => {
    setSelectedCode(code);
    window.history.replaceState(null, "", `/map?park=${code}`);
  };
  const deselect = () => {
    setSelectedCode(null);
    window.history.replaceState(null, "", "/map");
  };

  const selected = parks.find((p) => p.park_code === selectedCode) ?? null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <PublicNav active="map" redirectTo="/map" />

      <div style={{ position: "relative", height: `calc(100vh - ${PUBLIC_NAV_HEIGHT}px)`, background: "#CECDBC", overflow: "hidden" }}>
        <USAMap
          className="h-full w-full"
          parks={mapParks}
          selectedParkCode={selectedCode}
          onSelectPark={select}
          onDeselect={deselect}
          flyToTarget={flyToTarget}
        />
        {selected && (
          <MapRightPanel
            key={selected.park_code}
            park={{
              park_code: selected.park_code,
              name: selected.name,
              states: selected.states,
              status: "notVisited",
              description: selected.description ?? undefined,
              image_url: selected.image_url,
            }}
            onClose={deselect}
            guest={{ onSignIn: () => router.push(`/sign-in?redirect=${encodeURIComponent(`/map?park=${selected.park_code}`)}`) }}
          />
        )}
      </div>

      {/* Hidden while a park is open — the panel has its own sign-in prompt,
          and this fixed bar would cover the panel's buttons. */}
      {!selected && (
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
      )}
    </div>
  );
}
