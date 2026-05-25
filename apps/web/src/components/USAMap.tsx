"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3geo from "d3-geo";
import * as topojson from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";

export interface MapPark {
  park_code: string;
  name: string;
  position: [number, number];
  status: "visited" | "notVisited" | "bucketList";
}

interface USAMapProps {
  parks?: MapPark[];
  selectedParkCode?: string | null;
  onSelectPark?: (parkCode: string) => void;
  onDeselect?: () => void;
  className?: string;
}

const VISITED_COLOR = "#2F7A4A";
const BUCKET_COLOR  = "#D89A3A";
const UNVISIT_COLOR = "#A8A29A";
const LAND_FILL     = "#FFFBF1";
const OCEAN_BG      = "#CECDBC";
const WAVE_COLOR    = "#9E9880";

const MIN_K = 0.75;
const MAX_K = 10;

function topoCSS(color: string, opacity: number) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420' viewBox='0 0 420 420'><g fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-width='1'><path d='M-20 60 Q 60 30 130 60 T 280 60 T 440 60'/><path d='M-20 110 Q 60 80 130 110 T 280 110 T 440 110'/><path d='M-20 160 Q 60 130 130 160 T 280 160 T 440 160'/><path d='M-20 210 Q 60 180 130 210 T 280 210 T 440 210'/><path d='M-20 260 Q 60 230 130 260 T 280 260 T 440 260'/><path d='M-20 310 Q 60 280 130 310 T 280 310 T 440 310'/><path d='M-20 360 Q 60 330 130 360 T 280 360 T 440 360'/><path d='M-20 410 Q 60 380 130 410 T 280 410 T 440 410'/></g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

// Inverse-scale keeps markers visually constant size regardless of map zoom.
// The parent <g> is scaled by k, so scale(1/k) here cancels it out.
function ParkMarker({
  park,
  selected,
  scale,
  onClickMarker,
}: {
  park: MapPark & { x: number; y: number };
  selected: boolean;
  scale: number;
  onClickMarker: (e: React.MouseEvent) => void;
}) {
  const color =
    park.status === "visited"
      ? VISITED_COLOR
      : park.status === "bucketList"
      ? BUCKET_COLOR
      : UNVISIT_COLOR;

  const r     = selected ? 10 : park.status === "visited" ? 7.5 : 6;
  const haloR = selected ? 17 : park.status === "visited" ? 13 : 10;
  const sw    = selected ? 2 : 1.5;

  return (
    <g
      transform={`translate(${park.x},${park.y}) scale(${1 / scale})`}
      onClick={onClickMarker}
      style={{ cursor: "pointer" }}
    >
      <circle r={haloR} fill={color} fillOpacity={selected ? 0.24 : 0.15} />
      <circle r={r} fill={color} stroke={LAND_FILL} strokeWidth={sw} />
      {park.status === "visited" && (
        <path
          d={selected ? "M-4.5,0.3 L-1.5,3.2 L4.5,-3.2" : "M-3,0.2 L-1,2.2 L3,-2.2"}
          stroke={LAND_FILL}
          strokeWidth={selected ? 2 : 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
      {park.status === "bucketList" && (
        <path
          d={selected
            ? "M-2.8,-4.2 L2.8,-4.2 L2.8,4.2 L0,2.4 L-2.8,4.2 Z"
            : "M-2,-3 L2,-3 L2,3 L0,1.8 L-2,3 Z"}
          stroke={LAND_FILL}
          strokeWidth={1}
          strokeLinejoin="round"
          fill="none"
        />
      )}
    </g>
  );
}

export default function USAMap({
  parks = [],
  selectedParkCode,
  onSelectPark,
  onDeselect,
  className = "h-full w-full",
}: USAMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);

  const [dims, setDims]             = useState({ w: 960, h: 600 });
  const [statePaths, setStatePaths] = useState<string[]>([]);
  const [baseProj, setBaseProj]     = useState<d3geo.GeoProjection | null>(null);

  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [k, setK]   = useState(1);

  const drag       = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const hasDragged = useRef(false); // true if mouse moved >4px since mousedown

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDims({ w: width, h: height });
        setTx(0); setTy(0); setK(1);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fetch TopoJSON
  useEffect(() => {
    if (dims.w === 0) return;
    fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json")
      .then((r) => r.json())
      .then((topo: Topology) => {
        const states = topojson.feature(topo, topo.objects.states as GeometryCollection);
        const proj = d3geo
          .geoAlbersUsa()
          .fitExtent(
            [[dims.w * 0.03, dims.h * 0.05], [dims.w * 0.97, dims.h * 0.94]],
            states
          );
        const pathGen = d3geo.geoPath().projection(proj);
        const paths = (states as GeoJSON.FeatureCollection).features.map(
          (f) => pathGen(f) ?? ""
        );
        setStatePaths(paths);
        setBaseProj(() => proj);
      })
      .catch(console.error);
  }, [dims.w, dims.h]);

  const projectedParks = useMemo(() => {
    if (!baseProj) return [];
    return parks
      .map((p) => {
        const pt = baseProj([p.position[1], p.position[0]]);
        if (!pt) return null;
        return { ...p, x: pt[0], y: pt[1] };
      })
      .filter(Boolean) as (MapPark & { x: number; y: number })[];
  }, [parks, baseProj]);

  const sortedParks = useMemo(() => {
    return [...projectedParks].sort((a, b) => {
      const rank = (p: MapPark) =>
        p.park_code === selectedParkCode ? 3 : p.status === "visited" ? 2 : p.status === "bucketList" ? 1 : 0;
      return rank(a) - rank(b);
    });
  }, [projectedParks, selectedParkCode]);

  // Bounds: keep at least 120px of map visible on every edge
  const EDGE_MARGIN = 120;
  const clampT = useCallback((x: number, y: number, scale: number) => {
    const { w, h } = dims;
    return {
      cx: Math.min(w - EDGE_MARGIN, Math.max(EDGE_MARGIN - w * scale, x)),
      cy: Math.min(h - EDGE_MARGIN, Math.max(EDGE_MARGIN - h * scale, y)),
    };
  }, [dims]);

  // ── Zoom (wheel) ──────────────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 150);
    const factor = Math.pow(1.003, -delta);
    setK((prev) => {
      const next = Math.min(MAX_K, Math.max(MIN_K, prev * factor));
      const ratio = next / prev;
      const nx = mx - (mx - tx) * ratio;
      const ny = my - (my - ty) * ratio;
      const { cx, cy } = clampT(nx, ny, next);
      setTx(cx); setTy(cy);
      return next;
    });
  }, [tx, ty, clampT]);

  // ── Drag (pan) ────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    hasDragged.current = false;
    drag.current = { startX: e.clientX, startY: e.clientY, ox: tx, oy: ty };
  }, [tx, ty]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasDragged.current = true;
    const { cx, cy } = clampT(drag.current.ox + dx, drag.current.oy + dy, k);
    setTx(cx); setTy(cy);
  }, [k, clampT]);

  const onMouseUp = useCallback(() => { drag.current = null; }, []);

  // Deselect on background click (only if not a drag)
  const onSVGClick = useCallback(() => {
    if (!hasDragged.current) onDeselect?.();
  }, [onDeselect]);

  // Touch pan
  const lastTouch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1)
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !lastTouch.current) return;
    const dx = e.touches[0].clientX - lastTouch.current.x;
    const dy = e.touches[0].clientY - lastTouch.current.y;
    setTx((x) => clampT(x + dx, ty, k).cx);
    setTy((y) => clampT(tx, y + dy, k).cy);
    lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, [tx, ty, k, clampT]);
  const onTouchEnd = useCallback(() => { lastTouch.current = null; }, []);

  const transform = `translate(${tx},${ty}) scale(${k})`;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        background: OCEAN_BG,
        backgroundImage: topoCSS(WAVE_COLOR, 0.45),
      }}
    >
      <svg
        ref={svgRef}
        width={dims.w}
        height={dims.h}
        style={{ display: "block", background: "transparent", userSelect: "none" }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onSVGClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <defs>
          <filter id="usmap-shadow" x="-6%" y="-6%" width="112%" height="112%">
            <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="#00000028" />
          </filter>
        </defs>

        <g transform={transform} style={{ cursor: drag.current ? "grabbing" : "grab" }}>
          <g filter="url(#usmap-shadow)">
            {statePaths.map((d, i) => (
              <path key={i} d={d} fill={LAND_FILL} stroke="none" />
            ))}
          </g>
          {statePaths.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#C4BB9E" strokeWidth={0.7} />
          ))}
          {sortedParks.map((park) => (
            <ParkMarker
              key={park.park_code}
              park={park}
              selected={park.park_code === selectedParkCode}
              scale={k}
              onClickMarker={(e) => {
                e.stopPropagation(); // prevent SVG onClick from firing
                onSelectPark?.(park.park_code);
              }}
            />
          ))}
        </g>
      </svg>

      {/* Zoom controls */}
      <div style={{ position: "absolute", right: 16, bottom: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        {([{ label: "+", delta: 1.4 }, { label: "−", delta: 1 / 1.4 }, { label: "⊙", delta: 0 }] as const).map(({ label, delta }) => (
          <button
            key={label}
            onClick={() => {
              if (delta === 0) { setTx(0); setTy(0); setK(1); return; }
              const mcx = dims.w / 2, mcy = dims.h / 2;
              setK((prev) => {
                const next = Math.min(MAX_K, Math.max(MIN_K, prev * delta));
                const ratio = next / prev;
                const nx = mcx - (mcx - tx) * ratio;
                const ny = mcy - (mcy - ty) * ratio;
                const { cx: bx, cy: by } = clampT(nx, ny, next);
                setTx(bx); setTy(by);
                return next;
              });
            }}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: "0.5px solid #C4BB9E",
              background: "rgba(255,251,241,0.88)",
              backdropFilter: "blur(8px)",
              cursor: "pointer",
              fontFamily: label === "⊙" ? "inherit" : "var(--font-mono)",
              fontSize: label === "⊙" ? 14 : 18,
              fontWeight: 500, color: "#4A4535",
              display: "flex", alignItems: "center", justifyContent: "center",
              lineHeight: 1, padding: 0,
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
