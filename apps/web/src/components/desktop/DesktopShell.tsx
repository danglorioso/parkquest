"use client";

import { usePathname, useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Home, Sparkles, Map, User, Award, Compass,
  Check, Bookmark, PenLine, Users, Globe, TreePine,
  Plus, ChevronDown, LogOut, UserCircle, Pencil, Sun, Search,
  Menu, X,
} from "lucide-react";
import { GlobalSpotlight } from "@/components/desktop/GlobalSpotlight";
import { NotificationCenter } from "@/components/desktop/NotificationCenter";
import { PushPermissionPrompt } from "@/components/desktop/PushPermissionPrompt";
import { useTheme, type Palette } from "@/components/ThemeProvider";
import EditProfileDialog from "@/components/EditProfileDialog";
import { LogVisitModal } from "@/components/LogVisitModal";

// ── Wordmark ─────────────────────────────────────────────────────────────────

function Wordmark() {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--primary)" }}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginTop: -2, flexShrink: 0 }}
      >
        <path d="M3 20L9 9l3 5 3-7 6 13H3z" />
        <circle cx="20" cy="4" r="3.5" fill="var(--accent-2)" stroke="none" />
      </svg>
      <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.4, lineHeight: 1, color: "var(--primary)" }}>
        Park<span style={{ fontWeight: 500 }}>Quest</span>
      </span>
    </div>
  );
}

// ── Nav config ───────────────────────────────────────────────────────────────

const NAV = [
  {
    group: "PRIMARY",
    items: [
      { id: "dashboard", href: "/dashboard", icon: Home,    label: "Home" },
      { id: "feed",      href: "/feed",      icon: Sparkles, label: "Feed" },
      { id: "map",       href: "/map",       icon: Map,     label: "Map" },
      { id: "parks",     href: "/parks",     icon: TreePine, label: "Parks" },
      { id: "passport",  href: "/passport",  icon: User,    label: "Passport" },
      { id: "badges",    href: "/badges",    icon: Award,   label: "Badges" },
      { id: "planner",   href: "/planner",   icon: Compass, label: "Trip Planner" },
    ],
  },
  {
    group: "COLLECTIONS",
    items: [
      { id: "visited", href: "/visits",  icon: Check,    label: "Visited",    countKey: "visited" as const },
      { id: "bucket",  href: "/bucket",  icon: Bookmark, label: "Bucket list", countKey: "bucket" as const },
      { id: "journal", href: "/journal", icon: PenLine,  label: "Journal" },
    ],
  },
  {
    group: "PEOPLE",
    items: [
      { id: "friends",  href: "/friends",  icon: Users, label: "Friends" },
      { id: "discover", href: "/discover", icon: Globe,  label: "Discover" },
    ],
  },
] as const;

// ── AccountMenu ───────────────────────────────────────────────────────────────

export function AccountMenu({ onEditAccount, compact = false }: { onEditAccount: () => void; compact?: boolean }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const { palette, setPalette } = useTheme();
  const [open, setOpen] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAppearance(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); setShowAppearance(false); }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onDocClick), 0);
    document.addEventListener("keydown", onEsc);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  const name = user?.fullName ?? user?.username ?? "Explorer";
  const handle = user?.username ? `@${user.username}` : "";
  const avatarUrl = user?.imageUrl ?? "";

  const PALETTES: { id: Palette; label: string; color: string }[] = [
    { id: "forest",  label: "Forest",  color: "#1F3D2E" },
    { id: "canyon",  label: "Canyon",  color: "#7B3A1F" },
    { id: "glacier", label: "Glacier", color: "#2D4F66" },
    { id: "dusk",    label: "Dusk",    color: "#3A2E5C" },
  ];

  const menuItems = [
    { icon: UserCircle, label: "View profile", sub: "Your passport", onClick: () => { setOpen(false); router.push("/passport"); } },
    { icon: Pencil,     label: "Edit account",  onClick: () => { setOpen(false); onEditAccount(); } },
    { icon: Sun,        label: "Appearance",    onClick: () => setShowAppearance(s => !s) },
    { divider: true },
    { icon: LogOut,     label: "Sign out", danger: true, onClick: () => { setOpen(false); signOut(() => router.push("/")); } },
  ];

  const avatar = avatarUrl ? (
    <img src={avatarUrl} alt={name} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
  ) : (
    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--surface-alt)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, color: "var(--ink-mute)" }}>
      {name[0]?.toUpperCase()}
    </div>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: compact ? "auto" : "100%",
          background: open ? "rgba(31,61,46,0.06)" : "transparent",
          border: `0.5px solid ${open ? "var(--hairline)" : compact ? "var(--hairline-soft)" : "transparent"}`,
          borderRadius: 12,
          padding: compact ? "5px 8px 5px 5px" : "8px 10px 8px 8px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 9,
          textAlign: "left",
          transition: "background 120ms",
        }}
      >
        {avatar}
        {!compact && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            {handle && <div style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{handle}</div>}
          </div>
        )}
        <ChevronDown
          style={{ width: 13, height: 13, color: "var(--ink-mute)", flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 160ms" }}
          strokeWidth={2.2}
        />
      </button>

      {/* Dropdown panel — opens upward in sidebar, downward when compact */}
      {open && (
        <div
          style={{
            position: "absolute",
            ...(compact
              ? { top: "calc(100% + 8px)", right: 0, width: 220 }
              : { bottom: "calc(100% + 8px)", left: 0, right: 0 }),
            background: "rgba(255,251,241,0.98)",
            backdropFilter: "blur(24px) saturate(160%)",
            WebkitBackdropFilter: "blur(24px) saturate(160%)",
            border: "0.5px solid var(--hairline)",
            borderRadius: 12,
            padding: 5,
            boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
            zIndex: 50,
            animation: `${compact ? "pqAccMenuDown" : "pqAccMenu"} 160ms cubic-bezier(.2,.7,.3,1)`,
          }}
        >
          <style>{`
            @keyframes pqAccMenu { from { opacity: 0; transform: translateY(4px) scale(0.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
            @keyframes pqAccMenuDown { from { opacity: 0; transform: translateY(-4px) scale(0.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
            .pq-menu-item:hover { background: rgba(31,61,46,0.06) !important; }
          `}</style>

          {/* Profile snippet */}
          <div style={{ padding: "8px 10px 10px", borderBottom: "0.5px solid var(--hairline-soft)", marginBottom: 4 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "1.4px", color: "var(--ink-mute)", textTransform: "uppercase", fontWeight: 600 }}>SIGNED IN AS</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginTop: 2 }}>{name}</div>
          </div>

          {/* Items */}
          {menuItems.map((item, i) => {
            if ("divider" in item) {
              return <div key={i} style={{ height: 1, background: "var(--hairline-soft)", margin: "4px 6px" }} />;
            }
            const Icon = item.icon;
            return (
              <button
                key={i}
                onClick={item.onClick}
                className="pq-menu-item"
                style={{
                  width: "100%",
                  background: "transparent",
                  border: 0,
                  padding: "7px 10px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  textAlign: "left",
                  borderRadius: 8,
                  color: item.danger ? "#C04040" : "var(--ink)",
                  transition: "background 100ms",
                }}
              >
                <Icon style={{ width: 14, height: 14, color: item.danger ? "#C04040" : "var(--ink-soft)", flexShrink: 0 }} strokeWidth={2.0} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 12.5 }}>{item.label}</div>
                  {item.sub && <div style={{ fontSize: 10.5, color: "var(--ink-mute)", marginTop: 1 }}>{item.sub}</div>}
                </div>
              </button>
            );
          })}

          {/* Inline Appearance panel */}
          {showAppearance && (
            <div style={{ margin: "4px 5px 2px", padding: "10px 8px", background: "var(--surface-alt)", borderRadius: 8 }}>
              {/* Palette */}
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "1.4px", color: "var(--ink-mute)", fontWeight: 600, marginBottom: 6 }}>PALETTE</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {PALETTES.map(({ id, label, color }) => (
                  <button
                    key={id}
                    onClick={() => setPalette(id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: palette === id ? "var(--surface)" : "transparent",
                      border: palette === id ? "1px solid var(--hairline)" : "1px solid transparent",
                      borderRadius: 6, padding: "4px 6px", cursor: "pointer",
                    }}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, fontSize: 11, color: "var(--ink)" }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  visitedCount: number;
  totalCount: number;
  bucketCount: number;
  onLogVisit?: () => void;
  onEditAccount: () => void;
  onOpenSpotlight: () => void;
}

function DesktopSidebar({ visitedCount, totalCount, bucketCount, onLogVisit, onEditAccount, onOpenSpotlight }: SidebarProps) {
  const pathname = usePathname();
  const pct = totalCount > 0 ? (visitedCount / totalCount) * 100 : 0;

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 overflow-y-auto"
      style={{
        width: 232,
        background: "rgba(245,239,224,0.5)",
        borderRight: "0.5px solid var(--hairline)",
        backdropFilter: "blur(30px) saturate(160%)",
        WebkitBackdropFilter: "blur(30px) saturate(160%)",
        padding: "14px 0 12px",
      }}
    >
      {/* Wordmark */}
      <div style={{ padding: "6px 18px 10px" }}>
        <Link href="/dashboard" style={{ textDecoration: "none" }}>
          <Wordmark />
        </Link>
      </div>

      {/* Search trigger */}
      <div style={{ padding: "0 12px 12px" }}>
        <button
          onClick={onOpenSpotlight}
          style={{
            width: "100%", background: "var(--surface)", border: "0.5px solid var(--hairline)",
            borderRadius: 10, padding: "7px 10px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 7,
            fontFamily: "inherit",
          }}
        >
          <Search style={{ width: 13, height: 13, color: "var(--ink-mute)", flexShrink: 0 }} strokeWidth={2.2} />
          <span style={{ flex: 1, textAlign: "left", fontSize: 12.5, color: "var(--ink-mute)", fontWeight: 500 }}>Search…</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-mute)", padding: "2px 5px", background: "var(--surface-alt)", borderRadius: 4, letterSpacing: "0.4px", fontWeight: 600, flexShrink: 0 }}>⌘K</span>
        </button>
      </div>

      {/* Log a visit CTA */}
      <div style={{ padding: "0 12px 14px" }}>
        <button
          onClick={onLogVisit}
          className="w-full flex items-center justify-center gap-[7px] font-bold cursor-pointer"
          style={{
            WebkitAppearance: "none",
            appearance: "none",
            background: "var(--primary)",
            color: "#FFFBF1",
            fontSize: 13,
            letterSpacing: 0.1,
            padding: "10px 12px",
            borderRadius: "var(--r-sm)",
            border: "none",
            boxShadow: "0 4px 12px rgba(31,61,46,0.35)",
            transition: "background-color 150ms",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "color-mix(in srgb, var(--primary) 85%, white)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--primary)";
          }}
        >
          <Plus className="w-[15px] h-[15px] shrink-0" strokeWidth={2.4} />
          Log a visit
        </button>
      </div>

      {/* Nav groups */}
      <nav className="flex-1">
        {NAV.map((group) => (
          <div key={group.group} className="mb-4">
            <div
              className="uppercase font-semibold"
              style={{
                padding: "4px 18px 6px",
                fontSize: 9,
                letterSpacing: "1.6px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-mute)",
              }}
            >
              {group.group}
            </div>
            {group.items.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              const count =
                "countKey" in item && item.countKey === "visited"
                  ? visitedCount
                  : "countKey" in item && item.countKey === "bucket"
                  ? bucketCount
                  : undefined;

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="relative flex items-center gap-[10px] w-full transition-colors"
                  style={{
                    padding: "7px 18px",
                    background: isActive ? "rgba(31,61,46,0.08)" : "transparent",
                    color: isActive ? "var(--primary)" : "var(--ink-soft)",
                    fontWeight: isActive ? 700 : 500,
                    fontSize: 13,
                    textDecoration: "none",
                  }}
                >
                  {isActive && (
                    <div
                      className="absolute left-0 rounded-sm"
                      style={{
                        top: 8,
                        bottom: 8,
                        width: 3,
                        background: "var(--primary)",
                      }}
                    />
                  )}
                  <Icon
                    className="w-4 h-4 shrink-0"
                    strokeWidth={isActive ? 2.2 : 1.8}
                    style={{ color: isActive ? "var(--primary)" : "var(--ink-soft)" }}
                  />
                  <span className="flex-1">{item.label}</span>
                  {count != null && (
                    <span
                      className="font-semibold tabular-nums"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--ink-mute)",
                      }}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Quest progress + Account menu pinned to bottom */}
      <div
        style={{
          marginTop: "auto",
          padding: "10px 10px 0",
          borderTop: "0.5px solid var(--hairline-soft)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {/* Quest progress */}
        <div style={{ padding: "8px 4px 4px" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <span
              className="uppercase font-semibold"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "1.4px",
                color: "var(--ink-mute)",
              }}
            >
              QUEST
            </span>
            <span className="font-bold" style={{ fontSize: 11, color: "var(--ink)" }}>
              {visitedCount} / {totalCount || 63}
            </span>
          </div>
          <div
            className="rounded-full overflow-hidden"
            style={{ height: 6, background: "var(--surface-alt)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(to right, var(--primary), var(--accent))",
              }}
            />
          </div>
          <div style={{ fontSize: 10.5, color: "var(--ink-mute)", marginTop: 4 }}>
            {Math.round(pct)}% complete · {(totalCount || 63) - visitedCount} to go
          </div>
        </div>

        {/* Account menu + notification bell */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <AccountMenu onEditAccount={onEditAccount} />
          </div>
          <NotificationCenter />
        </div>
      </div>
    </aside>
  );
}

// ── Mobile header ────────────────────────────────────────────────────────────

function MobileHeader({
  onMenuOpen,
  onLogVisit,
  onOpenSpotlight,
}: {
  onMenuOpen: () => void;
  onLogVisit: () => void;
  onOpenSpotlight: () => void;
}) {
  return (
    <div
      className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between"
      style={{
        height: 54,
        padding: "0 12px",
        background: "rgba(245,239,224,0.96)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        borderBottom: "0.5px solid var(--hairline)",
      }}
    >
      <button
        onClick={onMenuOpen}
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          padding: "6px 8px", borderRadius: 8, color: "var(--ink)",
          display: "flex", alignItems: "center",
        }}
      >
        <Menu style={{ width: 22, height: 22 }} strokeWidth={2} />
      </button>

      <Link href="/dashboard" style={{ textDecoration: "none" }}>
        <Wordmark />
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          onClick={onOpenSpotlight}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            padding: "6px 8px", borderRadius: 8, color: "var(--ink-soft)",
            display: "flex", alignItems: "center",
          }}
        >
          <Search style={{ width: 18, height: 18 }} strokeWidth={2} />
        </button>
        <button
          onClick={onLogVisit}
          style={{
            background: "var(--primary)", color: "#FFFBF1",
            border: "none", borderRadius: 8,
            padding: "7px 12px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 13, fontWeight: 700, letterSpacing: 0.1,
            fontFamily: "inherit",
          }}
        >
          <Plus style={{ width: 14, height: 14 }} strokeWidth={2.4} />
          Log
        </button>
        <NotificationCenter />
      </div>
    </div>
  );
}

// ── Mobile drawer ─────────────────────────────────────────────────────────────

function MobileDrawer({
  open,
  onClose,
  visitedCount,
  totalCount,
  bucketCount,
  onLogVisit,
  onEditAccount,
}: {
  open: boolean;
  onClose: () => void;
  visitedCount: number;
  totalCount: number;
  bucketCount: number;
  onLogVisit: () => void;
  onEditAccount: () => void;
}) {
  const pathname = usePathname();
  const pct = totalCount > 0 ? (visitedCount / totalCount) * 100 : 0;

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="md:hidden fixed inset-0 z-40"
        style={{
          background: "rgba(0,0,0,0.45)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 250ms ease",
        }}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className="md:hidden fixed top-0 left-0 bottom-0 z-50 flex flex-col overflow-y-auto"
        style={{
          width: 280,
          background: "rgba(245,239,224,0.98)",
          backdropFilter: "blur(30px) saturate(160%)",
          WebkitBackdropFilter: "blur(30px) saturate(160%)",
          borderRight: "0.5px solid var(--hairline)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 280ms cubic-bezier(0.4, 0, 0.2, 1)",
          padding: "14px 0 12px",
          boxShadow: open ? "4px 0 32px rgba(0,0,0,0.18)" : "none",
        }}
      >
        {/* Header: wordmark + close */}
        <div style={{ padding: "6px 14px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/dashboard" style={{ textDecoration: "none" }} onClick={onClose}>
            <Wordmark />
          </Link>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              padding: 6, borderRadius: 8, color: "var(--ink-mute)",
              display: "flex", alignItems: "center",
            }}
          >
            <X style={{ width: 18, height: 18 }} strokeWidth={2} />
          </button>
        </div>

        {/* Log a visit CTA */}
        <div style={{ padding: "0 12px 14px" }}>
          <button
            onClick={() => { onClose(); onLogVisit(); }}
            className="w-full flex items-center justify-center gap-[7px] font-bold cursor-pointer"
            style={{
              background: "var(--primary)", color: "#FFFBF1",
              fontSize: 13, letterSpacing: 0.1,
              padding: "10px 12px", borderRadius: "var(--r-sm)",
              border: "none", boxShadow: "0 4px 12px rgba(31,61,46,0.35)",
              fontFamily: "inherit",
            }}
          >
            <Plus className="w-[15px] h-[15px] shrink-0" strokeWidth={2.4} />
            Log a visit
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1">
          {NAV.map((group) => (
            <div key={group.group} className="mb-4">
              <div
                className="uppercase font-semibold"
                style={{
                  padding: "4px 18px 6px", fontSize: 9,
                  letterSpacing: "1.6px", fontFamily: "var(--font-mono)",
                  color: "var(--ink-mute)",
                }}
              >
                {group.group}
              </div>
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                const count =
                  "countKey" in item && item.countKey === "visited" ? visitedCount
                  : "countKey" in item && item.countKey === "bucket" ? bucketCount
                  : undefined;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={onClose}
                    className="relative flex items-center gap-[10px] w-full transition-colors"
                    style={{
                      padding: "9px 18px",
                      background: isActive ? "rgba(31,61,46,0.08)" : "transparent",
                      color: isActive ? "var(--primary)" : "var(--ink-soft)",
                      fontWeight: isActive ? 700 : 500,
                      fontSize: 14,
                      textDecoration: "none",
                    }}
                  >
                    {isActive && (
                      <div className="absolute left-0 rounded-sm" style={{ top: 8, bottom: 8, width: 3, background: "var(--primary)" }} />
                    )}
                    <Icon
                      className="w-[18px] h-[18px] shrink-0"
                      strokeWidth={isActive ? 2.2 : 1.8}
                      style={{ color: isActive ? "var(--primary)" : "var(--ink-soft)" }}
                    />
                    <span className="flex-1">{item.label}</span>
                    {count != null && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)", fontWeight: 600 }}>
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Quest progress + account pinned to bottom */}
        <div style={{ marginTop: "auto", padding: "10px 10px 0", borderTop: "0.5px solid var(--hairline-soft)", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ padding: "8px 4px 4px" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "1.4px", color: "var(--ink-mute)", textTransform: "uppercase", fontWeight: 600 }}>QUEST</span>
              <span style={{ fontWeight: 700, fontSize: 11, color: "var(--ink)" }}>{visitedCount} / {totalCount || 63}</span>
            </div>
            <div className="rounded-full overflow-hidden" style={{ height: 6, background: "var(--surface-alt)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(to right, var(--primary), var(--accent))", transition: "width 500ms" }} />
            </div>
            <div style={{ fontSize: 10.5, color: "var(--ink-mute)", marginTop: 4 }}>
              {Math.round(pct)}% complete · {(totalCount || 63) - visitedCount} to go
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <AccountMenu onEditAccount={() => { onClose(); onEditAccount(); }} />
            </div>
            <NotificationCenter />
          </div>
        </div>
      </div>
    </>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────────

interface DesktopShellProps {
  children: React.ReactNode;
  fullbleed?: boolean;
  rightRail?: React.ReactNode;
  onLogVisit?: () => void;
  onOpenSpotlight?: () => void;
}

export function DesktopShell({
  children,
  fullbleed = false,
  rightRail,
  onLogVisit,
  onOpenSpotlight: onOpenSpotlightOverride,
}: DesktopShellProps) {
  const { user } = useUser();
  const [visitedCount, setVisitedCount] = useState(() => {
    if (typeof window === "undefined") return 0;
    const v = sessionStorage.getItem("pq_visited_count");
    return v ? parseInt(v, 10) : 0;
  });
  const [totalCount, setTotalCount] = useState(() => {
    if (typeof window === "undefined") return 63;
    const v = sessionStorage.getItem("pq_total_count");
    return v ? parseInt(v, 10) : 63;
  });
  const [bucketCount, setBucketCount] = useState(() => {
    if (typeof window === "undefined") return 0;
    const v = sessionStorage.getItem("pq_bucket_count");
    return v ? parseInt(v, 10) : 0;
  });
  const [editOpen, setEditOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [logVisitOpen, setLogVisitOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogVisit = onLogVisit ?? (() => setLogVisitOpen(true));
  const handleOpenSpotlight = onOpenSpotlightOverride ?? (() => setSpotlightOpen(true));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSpotlightOpen((s) => !s);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    fetch("/api/visits")
      .then((r) => (r.ok ? r.json() : []))
      .then(
        (
          visits: Array<{
            is_bucket_list: boolean;
            visited_date: string | null;
          }>
        ) => {
          const visited = visits.filter((v) => !v.is_bucket_list && v.visited_date).length;
          const bucket = visits.filter((v) => v.is_bucket_list).length;
          setVisitedCount(visited);
          setBucketCount(bucket);
          sessionStorage.setItem("pq_visited_count", String(visited));
          sessionStorage.setItem("pq_bucket_count", String(bucket));
        }
      )
      .catch(() => {});

    fetch("/api/parks")
      .then((r) => (r.ok ? r.json() : []))
      .then((parks: unknown[]) => {
        if (parks.length) {
          setTotalCount(parks.length);
          sessionStorage.setItem("pq_total_count", String(parks.length));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div
      className="flex flex-col md:flex-row md:h-screen md:overflow-hidden"
      style={{ background: "var(--bg)", minHeight: "100dvh" }}
    >
      <PushPermissionPrompt />
      <EditProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => { void user?.reload(); }}
      />
      <GlobalSpotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
      <LogVisitModal open={logVisitOpen} onClose={() => setLogVisitOpen(false)} />

      {/* Mobile-only: fixed top header + slide-in drawer */}
      <MobileHeader
        onMenuOpen={() => setMobileMenuOpen(true)}
        onLogVisit={handleLogVisit}
        onOpenSpotlight={handleOpenSpotlight}
      />
      <MobileDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        visitedCount={visitedCount}
        totalCount={totalCount}
        bucketCount={bucketCount}
        onLogVisit={handleLogVisit}
        onEditAccount={() => setEditOpen(true)}
      />

      {/* Desktop-only: left sidebar */}
      <DesktopSidebar
        visitedCount={visitedCount}
        totalCount={totalCount}
        bucketCount={bucketCount}
        onLogVisit={handleLogVisit}
        onEditAccount={() => setEditOpen(true)}
        onOpenSpotlight={handleOpenSpotlight}
      />

      {/* Main content — offset by header height on mobile */}
      <div className="flex flex-1 min-w-0 pt-[54px] md:pt-0 md:min-h-0" style={{ background: "var(--bg)" }}>
        {fullbleed ? (
          <div className="flex-1 min-w-0 overflow-hidden">{children}</div>
        ) : (
          <>
            <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
            {rightRail && (
              <div
                className="hidden md:block shrink-0 overflow-y-auto"
                style={{
                  width: 340,
                  borderLeft: "0.5px solid var(--hairline-soft)",
                  background: "var(--bg)",
                }}
              >
                {rightRail}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
