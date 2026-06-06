"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

const STORAGE_KEY = "pq_push_asked";

export function PushPermissionPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      Notification.permission !== "default" ||
      localStorage.getItem(STORAGE_KEY)
    ) return;

    // Small delay so the shell finishes rendering before the prompt appears
    const id = setTimeout(() => setVisible(true), 1800);
    return () => clearTimeout(id);
  }, []);

  async function handleAllow() {
    dismiss();
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      });
      await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
    } catch {
      // Push subscription failed silently — user can re-enable from browser settings
    }
  }

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10000,
        width: 340,
        background: "rgba(255,251,241,0.98)",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        border: "0.5px solid var(--hairline)",
        borderRadius: 16,
        boxShadow: "0 16px 48px rgba(0,0,0,0.22)",
        padding: "18px 18px 16px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        animation: "pq-slide-up 220ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <style>{`
        @keyframes pq-slide-up {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: "rgba(31,61,46,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Bell style={{ width: 17, height: 17, color: "var(--primary)" }} strokeWidth={2} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)", marginBottom: 3 }}>
          Stay in the loop
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.4, marginBottom: 12 }}>
          Get notified when someone follows you, likes a post, or leaves a comment.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleAllow}
            style={{
              flex: 1, padding: "7px 0",
              background: "var(--primary)", color: "#fff",
              border: 0, borderRadius: 8, cursor: "pointer",
              fontSize: 12.5, fontWeight: 650,
            }}
          >
            Allow notifications
          </button>
          <button
            onClick={dismiss}
            style={{
              padding: "7px 14px",
              background: "transparent",
              border: "0.5px solid var(--hairline)",
              borderRadius: 8, cursor: "pointer",
              fontSize: 12.5, fontWeight: 550, color: "var(--ink-mute)",
            }}
          >
            Not now
          </button>
        </div>
      </div>

      <button
        onClick={dismiss}
        style={{
          background: "transparent", border: 0, cursor: "pointer",
          padding: 2, color: "var(--ink-mute)", flexShrink: 0,
          display: "flex", alignItems: "center",
        }}
      >
        <X style={{ width: 13, height: 13 }} strokeWidth={2} />
      </button>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
}
