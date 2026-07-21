"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Users, Lock, Check, Sun, Moon } from "lucide-react";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { DesktopHeader } from "@/components/desktop/DesktopHeader";
import { Avatar } from "@/components/PostCard";
import { useToast } from "@/components/ToastProvider";
import { useTheme, type Palette } from "@/components/ThemeProvider";
import { getDefaultVisibility, setDefaultVisibility, type DefaultVisibility } from "@/lib/settings";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Report {
  id: number;
  target_type: string;
  reason: string;
  status: string;
  created_at: string | null;
}

interface BlockedUser {
  clerk_user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

// ── Labels ────────────────────────────────────────────────────────────────────

const PALETTES: { id: Palette; label: string; color: string }[] = [
  { id: "forest",  label: "Forest",  color: "#1F3D2E" },
  { id: "canyon",  label: "Canyon",  color: "#7B3A1F" },
  { id: "glacier", label: "Glacier", color: "#2D4F66" },
  { id: "dusk",    label: "Dusk",    color: "#3A2E5C" },
];

const VIS_OPTS: { v: DefaultVisibility; Icon: typeof Globe; label: string; desc: string }[] = [
  { v: "public",  Icon: Globe, label: "Public",  desc: "Posted publicly for all explorers" },
  { v: "friends", Icon: Users, label: "Friends", desc: "Posted to your friends' feeds" },
  { v: "private", Icon: Lock,  label: "Private", desc: "Only you, never posted to the feed" },
];

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  inappropriate: "Inappropriate content",
  impersonation: "Impersonation",
  misleading: "Misleading or fake account",
  blocked: "Blocked",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Pending review",
  actioned: "Actioned",
  dismissed: "Dismissed",
};

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
        letterSpacing: "1.2px", color: "var(--ink-mute)",
      }}>
        {children}
      </div>
      {hint && (
        <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 3 }}>{hint}</div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { toast } = useToast();
  const { dark, setDark, palette, setPalette } = useTheme();
  const [defaultVis, setDefaultVis] = useState<DefaultVisibility | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [unblockBusy, setUnblockBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDefaultVis(getDefaultVisibility());
    fetch("/api/reports").then(r => r.ok ? r.json() : []).then(setReports).catch(() => setReports([]));
    fetch("/api/blocks").then(r => r.ok ? r.json() : []).then(setBlocked).catch(() => setBlocked([]));
  }, []);

  const chooseDefaultVis = (v: DefaultVisibility) => {
    setDefaultVis(v);
    setDefaultVisibility(v);
  };

  const handleUnblock = async (u: BlockedUser) => {
    if (unblockBusy.has(u.clerk_user_id)) return;
    setUnblockBusy(s => new Set([...s, u.clerk_user_id]));
    try {
      const res = await fetch(`/api/blocks?userId=${encodeURIComponent(u.clerk_user_id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setBlocked(prev => prev?.filter(b => b.clerk_user_id !== u.clerk_user_id) ?? prev);
      toast(`Unblocked ${u.display_name ?? u.username ?? "user"}`);
    } catch {
      toast("Could not unblock. Please try again.", "error");
    } finally {
      setUnblockBusy(s => { const n = new Set(s); n.delete(u.clerk_user_id); return n; });
    }
  };

  return (
    <DesktopShell>
      <div style={{ maxWidth: 640, padding: "36px 28px 80px" }}>
        <DesktopHeader
          title="Settings"
          sub="Appearance, default visibility for new visits, blocked users, and reports you've sent."
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 34, marginTop: 28 }}>
          {/* Appearance */}
          <section>
            <SectionLabel>APPEARANCE</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {PALETTES.map(({ id, label, color }) => {
                  const on = palette === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setPalette(id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        borderRadius: 12, padding: 12, textAlign: "left",
                        cursor: "pointer",
                        border: on ? "1.5px solid var(--primary)" : "1.5px solid transparent",
                        background: on ? "var(--surface)" : "var(--surface-alt)",
                      }}
                    >
                      <span style={{ width: 22, height: 22, borderRadius: "50%", background: color, flexShrink: 0, border: "1px solid rgba(0,0,0,0.1)" }} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{label}</span>
                      {on && <Check size={14} strokeWidth={3} style={{ marginLeft: "auto", color: "var(--primary)" }} />}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setDark(!dark)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  borderRadius: 12, padding: 12, textAlign: "left",
                  cursor: "pointer",
                  border: "1.5px solid transparent",
                  background: "var(--surface-alt)",
                }}
              >
                <span style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--surface)", border: "1px solid var(--hairline)",
                  color: "var(--ink-soft)",
                }}>
                  {dark ? <Moon size={16} strokeWidth={2} /> : <Sun size={16} strokeWidth={2} />}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Dark mode</span>
                  <span style={{ display: "block", fontSize: 13, color: "var(--ink-mute)", marginTop: 1 }}>{dark ? "On" : "Off"}</span>
                </span>
                <span style={{
                  width: 40, height: 24, borderRadius: 12, flexShrink: 0, padding: 2,
                  background: dark ? "var(--primary)" : "var(--hairline)",
                  transition: "background 150ms",
                  display: "flex", alignItems: "center",
                }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: "50%", background: "#FFFBF1",
                    transform: dark ? "translateX(16px)" : "translateX(0)",
                    transition: "transform 150ms",
                  }} />
                </span>
              </button>
            </div>
          </section>

          {/* Default visibility */}
          <section>
            <SectionLabel hint="Applied to new visits you log — change it per-visit anytime.">
              DEFAULT POST VISIBILITY
            </SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {VIS_OPTS.map(o => {
                const on = defaultVis === o.v;
                return (
                  <button
                    key={o.v}
                    onClick={() => chooseDefaultVis(o.v)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      borderRadius: 12, padding: 12, textAlign: "left",
                      cursor: "pointer",
                      border: on
                        ? "1.5px solid var(--primary)"
                        : "1.5px solid transparent",
                      background: on ? "var(--surface)" : "var(--surface-alt)",
                    }}
                  >
                    <span style={{
                      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: on ? "var(--primary)" : "var(--surface)",
                      border: on ? "1px solid var(--primary)" : "1px solid var(--hairline)",
                      color: on ? "#FFFBF1" : "var(--ink-soft)",
                    }}>
                      <o.Icon size={16} strokeWidth={2} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{o.label}</span>
                      <span style={{ display: "block", fontSize: 13, color: "var(--ink-mute)", marginTop: 1 }}>{o.desc}</span>
                    </span>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: on ? "1.5px solid var(--primary)" : "1.5px solid var(--hairline)",
                      background: on ? "var(--primary)" : "transparent",
                      color: "#FFFBF1",
                    }}>
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Blocked users */}
          <section>
            <SectionLabel>BLOCKED USERS</SectionLabel>
            {blocked === null ? (
              <div style={{ fontSize: 13, color: "var(--ink-mute)" }}>Loading…</div>
            ) : blocked.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--ink-mute)" }}>You haven&apos;t blocked anyone.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {blocked.map(u => {
                  const name = u.display_name ?? u.username ?? "Explorer";
                  const busy = unblockBusy.has(u.clerk_user_id);
                  return (
                    <div
                      key={u.clerk_user_id}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        background: "var(--surface)", borderRadius: 12,
                        border: "0.5px solid var(--hairline)", padding: 12,
                      }}
                    >
                      {u.username ? (
                        <Link href={`/profile/${u.username}`} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                          <Avatar url={u.avatar_url} name={name} size={40} />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{name}</span>
                            <span style={{ display: "block", fontSize: 13, color: "var(--ink-mute)", marginTop: 1 }}>@{u.username}</span>
                          </span>
                        </Link>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                          <Avatar url={u.avatar_url} name={name} size={40} />
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{name}</span>
                        </div>
                      )}
                      <button
                        onClick={() => handleUnblock(u)}
                        disabled={busy}
                        style={{
                          borderRadius: 8, padding: "8px 14px", flexShrink: 0,
                          background: "var(--surface-alt)", border: "0.5px solid var(--hairline)",
                          fontSize: 13, fontWeight: 600, color: "var(--ink-soft)",
                          cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
                        }}
                      >
                        {busy ? "Unblocking…" : "Unblock"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Reports sent */}
          <section>
            <SectionLabel>REPORTS YOU&apos;VE SENT</SectionLabel>
            {reports === null ? (
              <div style={{ fontSize: 13, color: "var(--ink-mute)" }}>Loading…</div>
            ) : reports.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--ink-mute)" }}>You haven&apos;t reported anything.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {reports.map(r => (
                  <div
                    key={r.id}
                    style={{
                      background: "var(--surface)", borderRadius: 12,
                      border: "0.5px solid var(--hairline)", padding: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>
                        {r.target_type.toUpperCase()} · {REASON_LABELS[r.reason] ?? r.reason}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--ink-mute)", flexShrink: 0 }}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 3 }}>
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </DesktopShell>
  );
}
