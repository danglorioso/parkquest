"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X, AlertCircle } from "lucide-react";

type ToastVariant = "success" | "error";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

let nextId = 0;

function ToastItem({ item, onDismiss }: { item: Toast; onDismiss: (id: number) => void }) {
  const isError = item.variant === "error";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 14px",
        borderRadius: 12,
        background: isError ? "rgba(220,38,38,0.96)" : "rgba(31,61,46,0.96)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.32)",
        border: `0.5px solid ${isError ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.12)"}`,
        color: "#FFFBF1",
        fontSize: 13.5,
        fontWeight: 600,
        fontFamily: "var(--font-sans)",
        maxWidth: 340,
        animation: "pqToastIn 220ms cubic-bezier(.2,.7,.3,1)",
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
        background: isError ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {isError
          ? <AlertCircle size={12} strokeWidth={2.5} />
          : <Check size={12} strokeWidth={2.8} />
        }
      </div>
      <span style={{ flex: 1, lineHeight: 1.35 }}>{item.message}</span>
      <button
        onClick={() => onDismiss(item.id)}
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: "rgba(255,251,241,0.6)", padding: 2, display: "flex",
          alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
      >
        <X size={13} strokeWidth={2.4} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = ++nextId;
    setToasts(prev => [...prev, { id, message, variant }]);
    const timer = setTimeout(() => dismiss(id), 3500);
    timers.current.set(id, timer);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      <style>{`
        @keyframes pqToastIn {
          from { transform: translateY(12px) scale(0.95); opacity: 0; }
          to   { transform: translateY(0)    scale(1);    opacity: 1; }
        }
      `}</style>
      {children}
      {typeof window !== "undefined" && createPortal(
        <div style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "center",
          pointerEvents: toasts.length > 0 ? "auto" : "none",
        }}>
          {toasts.map(t => (
            <ToastItem key={t.id} item={t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}
