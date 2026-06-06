"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface MiniPark {
  park_code: string;
  latitude: string | null;
  longitude: string | null;
}

interface Props {
  parkCode: string;
  lat: number;
  lng: number;
  allParks: MiniPark[];
}

const FOCAL_COLOR  = "#2F7A4A";
const OTHER_COLOR  = "#A8A29A";
const OCEAN_BG     = "#CECDBC";
const LAND_FILL    = "#FFFBF1";
const BORDER_COLOR = "#C4BB9E";
const WAVE_COLOR   = "#9E9880";

function waveBg() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420' viewBox='0 0 420 420'><g fill='none' stroke='${WAVE_COLOR}' stroke-opacity='0.45' stroke-width='1'><path d='M-20 60 Q 60 30 130 60 T 280 60 T 440 60'/><path d='M-20 110 Q 60 80 130 110 T 280 110 T 440 110'/><path d='M-20 160 Q 60 130 130 160 T 280 160 T 440 160'/><path d='M-20 210 Q 60 180 130 210 T 280 210 T 440 210'/><path d='M-20 260 Q 60 230 130 260 T 280 260 T 440 260'/><path d='M-20 310 Q 60 280 130 310 T 280 310 T 440 310'/><path d='M-20 360 Q 60 330 130 360 T 280 360 T 440 360'/><path d='M-20 410 Q 60 380 130 410 T 280 410 T 440 410'/></g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function buildStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      ofm: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
      parks: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": LAND_FILL } },
      {
        id: "water",
        type: "fill",
        source: "ofm",
        "source-layer": "water",
        paint: { "fill-color": OCEAN_BG },
      },
      {
        id: "country-border",
        type: "line",
        source: "ofm",
        "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        paint: {
          "line-color": "#A09880",
          "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.8, 8, 1.5],
        },
      },
      {
        id: "state-border",
        type: "line",
        source: "ofm",
        "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        paint: {
          "line-color": BORDER_COLOR,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.7, 10, 1.2],
        },
      },
      {
        id: "place-city",
        type: "symbol",
        source: "ofm",
        "source-layer": "place",
        minzoom: 5,
        filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
        layout: {
          "text-field": ["get", "name"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9, 10, 12],
          "text-font": ["Noto Sans Regular"],
          "text-max-width": 8,
        },
        paint: {
          "text-color": "#5A5240",
          "text-halo-color": LAND_FILL,
          "text-halo-width": 1.5,
        },
      },
      // Other parks — small muted dots
      {
        id: "parks-other",
        type: "circle",
        source: "parks",
        filter: ["==", ["get", "focal"], false],
        paint: {
          "circle-radius": 4,
          "circle-color": OTHER_COLOR,
          "circle-opacity": 0.55,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#FFFBF1",
          "circle-stroke-opacity": 0.6,
        },
      },
      // Focal park — halo
      {
        id: "park-focal-halo",
        type: "circle",
        source: "parks",
        filter: ["==", ["get", "focal"], true],
        paint: {
          "circle-radius": 18,
          "circle-color": FOCAL_COLOR,
          "circle-opacity": 0.18,
        },
      },
      // Focal park — ring
      {
        id: "park-focal-ring",
        type: "circle",
        source: "parks",
        filter: ["==", ["get", "focal"], true],
        paint: {
          "circle-radius": 11,
          "circle-color": "#FFFBF1",
          "circle-opacity": 1,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": FOCAL_COLOR,
        },
      },
      // Focal park — inner dot
      {
        id: "park-focal-dot",
        type: "circle",
        source: "parks",
        filter: ["==", ["get", "focal"], true],
        paint: {
          "circle-radius": 6,
          "circle-color": FOCAL_COLOR,
          "circle-opacity": 1,
        },
      },
    ],
  };
}

export default function ParkMiniMap({ parkCode, lat, lng, allParks }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(),
      center: [lng, lat],
      zoom: 5.5,
      scrollZoom: false,
      dragRotate: false,
      touchPitch: false,
      interactive: false,
      attributionControl: false,
    });

    map.on("load", () => {
      const features: GeoJSON.Feature[] = allParks
        .filter((p) => p.latitude && p.longitude)
        .map((p) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [parseFloat(p.longitude!), parseFloat(p.latitude!)],
          },
          properties: { focal: p.park_code === parkCode },
        }));

      (map.getSource("parks") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features,
      });
    });

    return () => map.remove();
  }, [parkCode, lat, lng, allParks]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {/* Attribution */}
      <div
        style={{
          position: "absolute",
          bottom: 4,
          right: 6,
          fontSize: 9,
          color: "rgba(90,82,64,0.55)",
          fontFamily: "var(--font-mono)",
          pointerEvents: "none",
        }}
      >
        © OpenFreeMap · OpenStreetMap
      </div>
    </div>
  );
}
