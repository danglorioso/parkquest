"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

interface TripStop {
  park_code: string;
  name: string;
  position: [number, number];
}

interface PlannerMapProps {
  stops: TripStop[];
  className?: string;
}

function numberedIcon(n: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50%;background:#1F3D2E;border:2.5px solid #FFFBF1;display:flex;align-items:center;justify-content:center;color:#FFFBF1;font-weight:800;font-size:11px;font-family:Archivo,sans-serif;box-shadow:0 2px 8px rgba(31,61,46,0.35);">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function FitRoute({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.flyTo(positions[0], 7, { duration: 0.8 });
      return;
    }
    const bounds = L.latLngBounds(positions);
    map.fitBounds(bounds, { padding: [60, 60], animate: true, duration: 0.8 });
  }, [positions, map]);
  return null;
}

export default function PlannerMap({ stops, className = "h-full w-full" }: PlannerMapProps) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);

  const icons = useMemo(() => {
    if (!isClient) return null;
    return stops.map((_, i) => numberedIcon(i + 1));
  }, [isClient, stops.length]);

  const positions = stops.map((s) => s.position);

  if (!isClient || !icons) {
    return <div className={className} style={{ background: "#E8E2D0" }} />;
  }

  const center: [number, number] = stops.length > 0
    ? [
        stops.reduce((s, p) => s + p.position[0], 0) / stops.length,
        stops.reduce((s, p) => s + p.position[1], 0) / stops.length,
      ]
    : [39.8283, -98.5795];

  return (
    <MapContainer
      center={center}
      zoom={stops.length > 0 ? 5 : 4}
      className={className}
      maxBounds={[[-16.0, -180.0], [75.0, -42.0]]}
      maxBoundsViscosity={1.0}
      minZoom={3}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />

      <FitRoute positions={positions} />

      {/* Dashed route line */}
      {positions.length >= 2 && (
        <Polyline
          positions={positions}
          pathOptions={{
            color: "#1F3D2E",
            weight: 2,
            dashArray: "8 5",
            opacity: 0.8,
          }}
        />
      )}

      {/* Numbered stop markers */}
      {stops.map((stop, i) => (
        <Marker
          key={stop.park_code}
          position={stop.position}
          icon={icons[i]}
        />
      ))}
    </MapContainer>
  );
}
