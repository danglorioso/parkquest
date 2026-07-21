"use client";

// Cheap security-print watermark so the paper page reads as passport paper,
// not blank cream. Ported from apps/mobile/components/PassportWatermark.tsx —
// same wave formula, but tiled as a CSS background image at a fixed pixel
// scale (same technique as USAMapGL's waveBg() / the old passport page's
// topoPattern()) instead of one SVG stretched/cropped to fill the container —
// a single viewBox scaled via preserveAspectRatio to whatever height the
// stamp grid grows to blew the waves up huge and cropped them oddly on tall
// pages. A small repeating tile keeps the line weight constant regardless of
// how many stamp rows are in the page.

const TILE_W = 180;
const TILE_H = 110;

const waveD = (y: number) =>
  `M-20 ${y} C 25 ${y - 8}, 55 ${y + 8}, 90 ${y} S 160 ${y - 8}, 190 ${y}`;

function watermarkTile(): string {
  const ys = [10, 36, 62, 88];
  const paths = ys.map((y) => `<path d='${waveD(y)}' stroke='rgba(58,46,28,0.05)' stroke-width='1' fill='none'/>`).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${TILE_W}' height='${TILE_H}' viewBox='0 0 ${TILE_W} ${TILE_H}'>${paths}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export function PassportWatermark() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: watermarkTile(),
        backgroundSize: `${TILE_W}px ${TILE_H}px`,
        backgroundRepeat: "repeat",
        pointerEvents: "none",
      }}
    />
  );
}
