"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

export interface Park {
  park_code: string;
  name: string;
  states?: string;
  position: [number, number];
  status: "visited" | "notVisited" | "bucketList";
  description?: string;
  visitedDate?: string | null;
  title?: string | null;
  notes?: string | null;
  photos?: string[] | null;
  visibility?: string | null;
}

interface LeafletMapProps {
  center?: [number, number];
  zoom?: number;
  className?: string;
  parks?: Park[];
  selectedParkCode?: string | null;
  onSelectPark?: (parkCode: string) => void;
}

// ── SVG marker factory ────────────────────────────────────────────────────────

function markerSVG(
  status: Park["status"],
  selected: boolean
): { svg: string; size: number } {
  if (status === "visited") {
    if (selected) {
      return {
        size: 28,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="12" fill="rgba(47,122,74,0.25)"/>
          <circle cx="14" cy="14" r="7" fill="#2F7A4A" stroke="#FFFBF1" stroke-width="2"/>
          <path d="M10.5 14L13.2 16.5L18 11" stroke="#FFFBF1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>`,
      };
    }
    return {
      size: 22,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
        <circle cx="11" cy="11" r="9" fill="rgba(47,122,74,0.16)"/>
        <circle cx="11" cy="11" r="5.5" fill="#2F7A4A" stroke="#FFFBF1" stroke-width="1.5"/>
        <path d="M8.5 11L10.8 13.2L14.5 9" stroke="#FFFBF1" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>`,
    };
  }

  const isBucket = status === "bucketList";
  const color = isBucket ? "#D89A3A" : "#A8A29A";
  const rgba = isBucket ? "216,154,58" : "168,162,154";

  if (selected) {
    return {
      size: 22,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
        <circle cx="11" cy="11" r="9" fill="rgba(${rgba},0.22)"/>
        <circle cx="11" cy="11" r="5.5" fill="${color}" stroke="#FFFBF1" stroke-width="1.5"/>
      </svg>`,
    };
  }
  return {
    size: 16,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="5" fill="${color}" stroke="#FFFBF1" stroke-width="1.5"/>
    </svg>`,
  };
}

function makeIcon(status: Park["status"], selected: boolean): L.DivIcon {
  const { svg, size } = markerSVG(status, selected);
  return L.divIcon({
    className: "",
    html: svg,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ── FlyToMarker — pans to selected park when it changes ──────────────────────

function FlyToMarker({ park }: { park: Park | null }) {
  const map = useMap();
  useEffect(() => {
    if (!park) return;
    map.flyTo(park.position, Math.max(map.getZoom(), 7), { duration: 0.7 });
  }, [park, map]);
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LeafletMap({
  center = [39.8283, -98.5795],
  zoom = 4,
  className = "h-full w-full",
  parks = [],
  selectedParkCode,
  onSelectPark,
}: LeafletMapProps) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);

  const icons = useMemo(() => {
    if (!isClient) return null;
    return {
      visited:           makeIcon("visited",    false),
      "visited-sel":     makeIcon("visited",    true),
      bucketList:        makeIcon("bucketList", false),
      "bucketList-sel":  makeIcon("bucketList", true),
      notVisited:        makeIcon("notVisited", false),
      "notVisited-sel":  makeIcon("notVisited", true),
    };
  }, [isClient]);

  const selectedPark = selectedParkCode
    ? (parks.find((p) => p.park_code === selectedParkCode) ?? null)
    : null;

  if (!isClient || !icons) {
    return (
      <div
        className={className}
        style={{ background: "var(--surface-alt)", animation: "pulse 2s infinite" }}
      />
    );
  }

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className={className}
      maxBounds={[[-16.0, -180.0], [75.0, -42.0]]}
      maxBoundsViscosity={1.0}
      minZoom={3}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <FlyToMarker park={selectedPark} />
      {parks.map((park) => {
        const isSel = park.park_code === selectedParkCode;
        const key = `${park.status}${isSel ? "-sel" : ""}` as keyof typeof icons;
        return (
          <Marker
            key={park.park_code}
            position={park.position}
            icon={icons[key]}
            eventHandlers={{
              click: () => onSelectPark?.(park.park_code),
            }}
          />
        );
      })}
    </MapContainer>
  );
}
