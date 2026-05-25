"use client";

import dynamic from "next/dynamic";
import type { Park } from "./LeafletMap";

const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div
      className="h-full w-full animate-pulse"
      style={{ background: "var(--surface-alt)" }}
    />
  ),
});

interface MapProps {
  center?: [number, number];
  zoom?: number;
  className?: string;
  parks?: Park[];
  selectedParkCode?: string | null;
  onSelectPark?: (parkCode: string) => void;
}

export default function Map(props: MapProps = {}) {
  return <LeafletMap {...props} />;
}
