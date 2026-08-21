"use client";

import { useEffect, useRef } from "react";
import { Home } from "lucide-react";
import maplibregl from "maplibre-gl";
import type { GeoJSONSource, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapPark {
  park_code: string;
  name: string;
  position: [number, number]; // [lat, lng]
  status: "visited" | "notVisited" | "bucketList";
  // Unset (e.g. the profile page's small visited-parks map) renders as if
  // true — full-size/primary — rather than forcing every caller to plumb
  // this through just to avoid the historical-park demotion styling.
  is_national_park?: boolean;
}

interface Props {
  parks?: MapPark[];
  selectedParkCode?: string | null;
  onSelectPark?: (parkCode: string) => void;
  onDeselect?: () => void;
  className?: string;
  initialBounds?: [[number, number], [number, number]];
  showControls?: boolean;
  flyToTarget?: { coords: [number, number]; rightPadding?: number } | null;
  labelsEnabled?: boolean;
  labelFontSize?: number;
}

const VISITED_COLOR = "#2F7A4A";
const BUCKET_COLOR  = "#D89A3A";
const UNVISIT_COLOR = "#A8A29A";
const OCEAN_BG      = "#CECDBC";
const WAVE_COLOR    = "#9E9880";
const LAND_FILL     = "#FFFBF1";
const BORDER_COLOR  = "#C4BB9E";
const INK_COLOR     = "#3D3726";

// Same zoom the old GL text-symbol layer used to gate labels at.
const LABEL_ZOOM_GATE = 7;

// Strips the "National Park" designation for map labels, where space is
// tight — mirrors the mobile map's shortParkName.
function shortParkName(name: string): string {
  return name
    .replace(/^National Park of /i, "")
    .replace(/ National (?:and State )?Parks?(?: (?:&|and) Preserve)?$/i, "")
    .trim();
}

function waveBg() {
  const color = WAVE_COLOR;
  const opacity = 0.45;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420' viewBox='0 0 420 420'><g fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-width='1'><path d='M-20 60 Q 60 30 130 60 T 280 60 T 440 60'/><path d='M-20 110 Q 60 80 130 110 T 280 110 T 440 110'/><path d='M-20 160 Q 60 130 130 160 T 280 160 T 440 160'/><path d='M-20 210 Q 60 180 130 210 T 280 210 T 440 210'/><path d='M-20 260 Q 60 230 130 260 T 280 260 T 440 260'/><path d='M-20 310 Q 60 280 130 310 T 280 310 T 440 310'/><path d='M-20 360 Q 60 330 130 360 T 280 360 T 440 360'/><path d='M-20 410 Q 60 380 130 410 T 280 410 T 440 410'/></g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function parksGeoJSON(parks: MapPark[], selectedCode?: string | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: parks.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.position[1], p.position[0]] },
      properties: {
        park_code: p.park_code,
        name: p.name,
        status: p.status,
        selected: p.park_code === selectedCode,
        is_national_park: p.is_national_park,
      },
    })),
  };
}

function buildStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      ofm: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
      },
      parks: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
    },
    layers: [
      // Ocean background
      { id: "bg", type: "background", paint: { "background-color": LAND_FILL } },

      // Water covers the ocean/lakes/rivers
      {
        id: "water",
        type: "fill",
        source: "ofm",
        "source-layer": "water",
        paint: { "fill-color": OCEAN_BG },
      },

      // Country borders
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

      // State/province borders
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

      // Major roads (motorways, trunks) at zoom 7+
      {
        id: "road-major",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        minzoom: 7,
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
        paint: {
          "line-color": "#D4CBB5",
          "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.7, 14, 3.5],
        },
      },

      // Secondary roads at zoom 9+
      {
        id: "road-secondary",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        minzoom: 9,
        filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]],
        paint: {
          "line-color": "#DDD6C2",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.4, 14, 1.8],
        },
      },

      // Local roads at zoom 11+
      {
        id: "road-local",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        minzoom: 11,
        filter: ["in", ["get", "class"], ["literal", ["minor", "service", "track", "path"]]],
        paint: {
          "line-color": "#E5DFD0",
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.3, 14, 1.2],
        },
      },

      // City/town labels at zoom 5+
      {
        id: "place-city",
        type: "symbol",
        source: "ofm",
        "source-layer": "place",
        minzoom: 5,
        filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
        layout: {
          "text-field": ["get", "name"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9, 10, 13],
          "text-font": ["Noto Sans Regular"],
          "text-max-width": 8,
        },
        paint: {
          "text-color": "#5A5240",
          "text-halo-color": LAND_FILL,
          "text-halo-width": 1.5,
        },
      },

      // Park marker halos — smaller/fainter for non-National-Park pins, so
      // the curated 63 stay visually primary when both types are on screen.
      {
        id: "parks-halo",
        type: "circle",
        source: "parks",
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "selected"], true], 17,
            ["==", ["get", "is_national_park"], false], 7,
            ["==", ["get", "status"], "visited"], 13,
            10,
          ],
          "circle-color": [
            "case",
            ["==", ["get", "status"], "visited"], VISITED_COLOR,
            ["==", ["get", "status"], "bucketList"], BUCKET_COLOR,
            UNVISIT_COLOR,
          ],
          "circle-opacity": [
            "case",
            ["==", ["get", "selected"], true], 0.24,
            ["==", ["get", "is_national_park"], false], 0.08,
            0.15,
          ],
        },
      },

      // Park marker dots
      {
        id: "parks-dot",
        type: "circle",
        source: "parks",
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "selected"], true], 10,
            ["==", ["get", "is_national_park"], false], 4.5,
            ["==", ["get", "status"], "visited"], 7.5,
            6,
          ],
          "circle-color": [
            "case",
            ["==", ["get", "status"], "visited"], VISITED_COLOR,
            ["==", ["get", "status"], "bucketList"], BUCKET_COLOR,
            UNVISIT_COLOR,
          ],
          "circle-opacity": ["case", ["==", ["get", "is_national_park"], false], 0.72, 1],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "selected"], true], 2,
            ["==", ["get", "is_national_park"], false], 1,
            1.5,
          ],
          "circle-stroke-color": LAND_FILL,
        },
      },

    ],
  };
}

// Floating name-pill DOM marker — mirrors the mobile map's ParkLabelMarker
// pill styling (rounded cream pill, bold 11.5pt text, hairline border),
// positioned to the right of the park's dot.
function buildLabelPillEl(
  park: MapPark,
  onSelectRef: { current?: ((parkCode: string) => void) | undefined },
  fontSize: number,
): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = shortParkName(park.name);
  // Historical park labels stay smaller/lighter — same hierarchy as their
  // dots, so National Parks keep reading as the map's primary content.
  // Unset (is_national_park === undefined) defaults to primary, same as
  // the GL paint expressions do for callers that don't set it.
  const isPrimary = park.is_national_park !== false;
  Object.assign(el.style, {
    display: "none", // gated by zoom + labelsEnabled — set by updateLabelVisibility
    padding: isPrimary ? "3px 7px" : "2px 5px",
    borderRadius: "6px",
    border: `0.5px solid ${BORDER_COLOR}`,
    background: isPrimary ? "rgba(255,251,241,0.9)" : "rgba(255,251,241,0.7)",
    fontSize: `${isPrimary ? fontSize : fontSize - 1.5}px`,
    fontWeight: isPrimary ? "700" : "600",
    color: isPrimary ? INK_COLOR : `${INK_COLOR}99`,
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
    lineHeight: "1.3",
  });
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onSelectRef.current?.(park.park_code);
  });
  return el;
}

const BTN: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: `0.5px solid ${BORDER_COLOR}`,
  background: "rgba(255,251,241,0.88)",
  backdropFilter: "blur(8px)",
  cursor: "pointer",
  fontSize: 18,
  fontWeight: 500,
  color: "#4A4535",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
  padding: 0,
};

export default function USAMapGL({
  parks = [],
  selectedParkCode,
  onSelectPark,
  onDeselect,
  className = "h-full w-full",
  initialBounds,
  showControls = true,
  flyToTarget,
  labelsEnabled = true,
  labelFontSize = 11.5,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);
  const loadedRef    = useRef(false);
  const labelMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  // Keep callbacks/props stable for closures registered once at map init
  const onSelectRef  = useRef(onSelectPark);
  const onDeselectRef = useRef(onDeselect);
  const labelsEnabledRef = useRef(labelsEnabled);
  const labelFontSizeRef = useRef(labelFontSize);
  useEffect(() => { onSelectRef.current = onSelectPark; }, [onSelectPark]);
  useEffect(() => { onDeselectRef.current = onDeselect; }, [onDeselect]);
  useEffect(() => { labelFontSizeRef.current = labelFontSize; }, [labelFontSize]);

  // Show name pills only once zoomed in enough to have room for them (matches
  // the old GL text layer's minzoom gate) and only if labels are toggled on.
  const updateLabelVisibility = () => {
    const map = mapRef.current;
    if (!map) return;
    const visible = labelsEnabledRef.current && map.getZoom() >= LABEL_ZOOM_GATE;
    for (const marker of labelMarkersRef.current.values()) {
      marker.getElement().style.display = visible ? "" : "none";
    }
  };

  // Add/remove a pill marker per park, keyed by park_code.
  const syncLabelMarkers = () => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const p of parks) {
      seen.add(p.park_code);
      if (!labelMarkersRef.current.has(p.park_code)) {
        const el = buildLabelPillEl(p, onSelectRef, labelFontSizeRef.current);
        const marker = new maplibregl.Marker({ element: el, anchor: "left", offset: [12, 0] })
          .setLngLat([p.position[1], p.position[0]])
          .addTo(map);
        labelMarkersRef.current.set(p.park_code, marker);
      }
    }
    for (const [code, marker] of labelMarkersRef.current) {
      if (!seen.has(code)) {
        marker.remove();
        labelMarkersRef.current.delete(code);
      }
    }
    updateLabelVisibility();
  };

  // Toggle visibility immediately when "Show labels" flips.
  useEffect(() => {
    labelsEnabledRef.current = labelsEnabled;
    updateLabelVisibility();
  }, [labelsEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-apply font size to existing pills when the slider moves.
  useEffect(() => {
    for (const marker of labelMarkersRef.current.values()) {
      marker.getElement().style.fontSize = `${labelFontSize}px`;
    }
  }, [labelFontSize]);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(),
      ...(initialBounds
        ? { bounds: initialBounds, fitBoundsOptions: { padding: 10 } }
        : { center: [-98.5, 39.0] as [number, number], zoom: 3.6 }),
      minZoom: 2.5,
      maxZoom: 14,
      attributionControl: false,
    });

    map.on("load", () => {
      loadedRef.current = true;
      // Push current parks data into the source
      const src = map.getSource("parks") as GeoJSONSource;
      src?.setData(parksGeoJSON(parks, selectedParkCode));

      // Click on a park marker → select
      map.on("click", "parks-dot", (e) => {
        const code = e.features?.[0]?.properties?.park_code as string | undefined;
        if (code) onSelectRef.current?.(code);
      });

      // Click on background → deselect (only if no park feature hit)
      map.on("click", (e) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: ["parks-dot", "parks-halo"] });
        if (hit.length === 0) onDeselectRef.current?.();
      });

      map.on("mouseenter", "parks-dot", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "parks-dot", () => { map.getCanvas().style.cursor = ""; });

      syncLabelMarkers();
      map.on("zoom", updateLabelVisibility);
    });

    mapRef.current = map;
    return () => {
      for (const marker of labelMarkersRef.current.values()) marker.remove();
      labelMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update parks GeoJSON (and their label pills) whenever data or selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const src = map.getSource("parks") as GeoJSONSource;
      src?.setData(parksGeoJSON(parks, selectedParkCode));
      syncLabelMarkers();
    };
    if (loadedRef.current) {
      update();
    } else {
      map.once("load", update);
    }
  }, [parks, selectedParkCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to a park when flyToTarget changes (e.g. selected from search)
  useEffect(() => {
    if (!flyToTarget) return;
    const map = mapRef.current;
    if (!map) return;
    const { coords: [lat, lng], rightPadding = 0 } = flyToTarget;
    const doFly = () =>
      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 7),
        padding: { top: 0, bottom: 0, left: 0, right: rightPadding },
        duration: 900,
        essential: true,
      });
    if (loadedRef.current) doFly();
    else map.once("load", doFly);
  }, [flyToTarget]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        background: OCEAN_BG,
        backgroundImage: waveBg(),
      }}
    >
      {/* MapLibre canvas */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Zoom controls — bottom-right, matching D3 map style */}
      {showControls && (
        <div style={{ position: "absolute", right: 16, bottom: 16, display: "flex", flexDirection: "column", gap: 4, zIndex: 10 }}>
          {([
            { label: "+",    action: () => mapRef.current?.zoomIn() },
            { label: "−",    action: () => mapRef.current?.zoomOut() },
            { label: "home", action: () => mapRef.current?.flyTo({ center: [-98.5, 39.0], zoom: 3.6 }) },
          ] as const).map(({ label, action }) => (
            <button key={label} onClick={action} style={{ ...BTN, fontFamily: "var(--font-mono)", fontSize: 18 }}>
              {label === "home"
                ? <Home style={{ width: 14, height: 14, color: "#4A4535" }} strokeWidth={2} />
                : label}
            </button>
          ))}
        </div>
      )}

      {/* Hide default MapLibre attribution */}
      <style>{`.maplibregl-ctrl-attrib { display: none !important; } .maplibregl-ctrl-logo { display: none !important; }`}</style>
    </div>
  );
}
