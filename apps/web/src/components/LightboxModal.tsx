"use client";

import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export interface LightboxImage {
  url: string;
  caption?: string;
  credit?: string;
}

interface Props {
  images: LightboxImage[];
  startIndex?: number;
  onClose: () => void;
}

export function LightboxModal({ images, startIndex = 0, onClose }: Props) {
  const [idx, setIdx] = useState(startIndex);
  const prev = () => setIdx((i) => (i - 1 + images.length) % images.length);
  const next = () => setIdx((i) => (i + 1) % images.length);
  const current = images[idx];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { prev(); e.stopImmediatePropagation(); }
      else if (e.key === "ArrowRight") { next(); e.stopImmediatePropagation(); }
      else if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.92)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.12)", border: "none", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}
      >
        <X size={18} />
      </button>

      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            style={{ position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.12)", border: "none", borderRadius: "50%", width: 48, height: 48, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}
          >
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.12)", border: "none", borderRadius: "50%", width: 48, height: 48, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}

      <img
        src={current.url}
        alt={current.caption ?? ""}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "90vw", maxHeight: "78vh", objectFit: "contain", borderRadius: 10, userSelect: "none" }}
      />

      {(current.caption || current.credit) && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ marginTop: 16, textAlign: "center", maxWidth: 640, padding: "0 24px" }}
        >
          {current.caption && (
            <div style={{ fontSize: 13.5, fontWeight: 500, color: "rgba(255,255,255,0.90)", lineHeight: 1.5, marginBottom: current.credit ? 4 : 0 }}>
              {current.caption}
            </div>
          )}
          {current.credit && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "var(--font-mono)", letterSpacing: "0.4px" }}>
              {current.credit}
            </div>
          )}
        </div>
      )}

      {images.length > 1 && (
        <div style={{ marginTop: 20, display: "flex", gap: 6 }}>
          {images.map((_, i) => (
            <div
              key={i}
              onClick={(e) => { e.stopPropagation(); setIdx(i); }}
              style={{ width: 6, height: 6, borderRadius: "50%", background: i === idx ? "#fff" : "rgba(255,255,255,0.30)", cursor: "pointer" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
