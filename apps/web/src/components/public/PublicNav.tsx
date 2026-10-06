"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Menu, Search, X } from "lucide-react";
import Logo from "@/components/Logo";
import { APP_STORE_URL } from "@/components/AppStoreBadge";
import { fullStateName } from "@/lib/stateNames";

// Top bar for the signed-out pages (public profile, parks, shared posts).
// Signed-in visitors get DesktopShell instead, which has its own search + nav.

export const PUBLIC_NAV_HEIGHT = 60;

interface PublicLink {
  id: string;
  label: string;
  href: string;
  /** Behind middleware auth — see publicHref. */
  gated?: boolean;
}

export const PUBLIC_NAV_LINKS: PublicLink[] = [
  { id: "parks",    label: "Parks",    href: "/parks" },
  { id: "map",      label: "Map",      href: "/map",      gated: true },
  { id: "passport", label: "Passport", href: "/passport", gated: true },
  { id: "badges",   label: "Badges",   href: "/badges",   gated: true },
  { id: "support",  label: "Support",  href: "/support" },
];

/**
 * Middleware bounces signed-out requests for gated routes to the landing page
 * and drops the destination. Routing through /sign-in keeps it, so the visitor
 * lands where they meant to go once they're in.
 */
export function publicHref(link: { href: string; gated?: boolean }, isSignedIn: boolean | undefined): string {
  return link.gated && !isSignedIn ? `/sign-in?redirect=${encodeURIComponent(link.href)}` : link.href;
}

// ── Search ────────────────────────────────────────────────────────────────────

interface SearchPark {
  park_code: string;
  name: string;
  states: string;
  is_national_park: boolean;
}

interface SearchUser {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

const MAX_USERS = 4;
const MAX_PARKS = 6;

function NavSearch() {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const userTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parksRequested = useRef(false);

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [parks, setParks] = useState<SearchPark[]>([]);
  const [parksReady, setParksReady] = useState(false);
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);

  // The park list is one long-cached response — fetched on first use, then
  // filtered locally. Only the people search hits the server per keystroke.
  const loadParks = () => {
    if (parksRequested.current) return;
    parksRequested.current = true;
    fetch("/api/parks")
      .then((r) => (r.ok ? r.json() : []))
      .then((p) => { setParks(p); setParksReady(true); })
      .catch(() => { parksRequested.current = false; });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => () => { if (userTimer.current) clearTimeout(userTimer.current); }, []);

  const handleChange = (value: string) => {
    // Not only on focus — autofill and paste can change the value without one
    loadParks();
    setQ(value);
    setOpen(true);
    setActiveIdx(-1);
    if (userTimer.current) clearTimeout(userTimer.current);
    if (!value.trim()) { setUsers([]); return; }
    userTimer.current = setTimeout(() => {
      fetch(`/api/users?search=${encodeURIComponent(value.trim())}&limit=${MAX_USERS}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setUsers)
        .catch(() => {});
    }, 200);
  };

  const term = q.trim().toLowerCase();

  const parkResults = useMemo(() => {
    if (!term) return [];
    return parks
      .filter((p) => {
        const stateNames = p.states.split(",").map((s) => fullStateName(s.trim())).join(" ");
        return `${p.name} ${stateNames}`.toLowerCase().includes(term);
      })
      // The 63 national parks outrank the monuments/historic sites that share a name fragment
      .sort((a, b) => Number(b.is_national_park) - Number(a.is_national_park) || a.name.localeCompare(b.name))
      .slice(0, MAX_PARKS);
  }, [parks, term]);

  const userResults = term ? users.slice(0, MAX_USERS) : [];
  const hrefs = [
    ...userResults.map((u) => `/profile/${u.username}`),
    ...parkResults.map((p) => `/parks/${p.park_code}`),
  ];

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    setUsers([]);
    inputRef.current?.blur();
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hrefs.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      const href = hrefs[activeIdx] ?? hrefs[0];
      if (href) { e.preventDefault(); go(href); }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showPanel = open && !!term;
  const rowStyle = (href: string): React.CSSProperties => ({
    width: "100%", border: 0, cursor: "pointer", textAlign: "left",
    padding: "8px 14px", display: "flex", alignItems: "center", gap: 11,
    background: hrefs[activeIdx] === href ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent",
  });

  return (
    <div ref={wrapRef} className="pq-pubnav-search" style={{ position: "relative", minWidth: 0 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, height: 36,
        background: "var(--surface)", border: "0.5px solid var(--hairline)",
        borderRadius: 10, padding: "0 12px",
      }}>
        <Search style={{ width: 14, height: 14, color: "var(--ink-mute)", flexShrink: 0 }} strokeWidth={2.2} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { loadParks(); setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder="Search parks and people…"
          aria-label="Search parks and people"
          style={{
            flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent",
            fontSize: 13.5, fontWeight: 500, color: "var(--ink)", fontFamily: "inherit",
          }}
        />
        {q && (
          <button
            onClick={() => { handleChange(""); inputRef.current?.focus(); }}
            aria-label="Clear search"
            style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--ink-mute)", display: "flex" }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>

      {showPanel && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, minWidth: 280, zIndex: 120,
          background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 12,
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)", overflow: "hidden", padding: "6px 0",
        }}>
          {userResults.length > 0 && (
            <>
              <div className="pq-pubnav-group">People</div>
              {userResults.map((u) => {
                const href = `/profile/${u.username}`;
                return (
                  <button key={u.username} onClick={() => go(href)} className="pq-pubnav-row" style={rowStyle(href)}>
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface-alt)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--ink-mute)" }}>
                        {u.username[0]?.toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {u.display_name || `@${u.username}`}
                      </div>
                      {u.display_name && (
                        <div style={{ fontSize: 11.5, color: "var(--ink-mute)", marginTop: 1 }}>@{u.username}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {parkResults.length > 0 && (
            <>
              <div className="pq-pubnav-group">Parks</div>
              {parkResults.map((p) => {
                const href = `/parks/${p.park_code}`;
                return (
                  <button key={p.park_code} onClick={() => go(href)} className="pq-pubnav-row" style={rowStyle(href)}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-mute)", marginTop: 1 }}>
                        {p.states.split(",").map((s) => fullStateName(s.trim())).join(", ")}
                      </div>
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {hrefs.length === 0 && (
            <div style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-mute)", textAlign: "center" }}>
              {parksReady ? <>No parks or people match &ldquo;{q.trim()}&rdquo;.</> : "Searching…"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

export function PublicNav({ active, redirectTo }: {
  /** id from PUBLIC_NAV_LINKS to mark as the current section. */
  active?: string;
  /** Where "Sign in" should return to — usually the current path. */
  redirectTo?: string;
}) {
  const { isLoaded, isSignedIn } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);

  const signInHref = redirectTo ? `/sign-in?redirect=${encodeURIComponent(redirectTo)}` : "/sign-in";

  const outline: React.CSSProperties = {
    background: "transparent", border: "0.5px solid var(--hairline)",
    borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600,
    color: "var(--ink)", textDecoration: "none", whiteSpace: "nowrap", textAlign: "center",
  };
  const filled: React.CSSProperties = {
    background: "var(--primary)", border: "0.5px solid var(--primary)",
    borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700,
    color: "#FFFBF1", textDecoration: "none", whiteSpace: "nowrap", textAlign: "center",
  };

  // Held back until Clerk resolves so a signed-in visitor never sees "Sign in" flash
  const actions = !isLoaded ? null : isSignedIn ? (
    <Link href="/feed" style={filled}>Open ParkQuest</Link>
  ) : (
    <>
      <Link href={signInHref} style={outline}>Sign in</Link>
      <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" style={filled}>Get the app</a>
    </>
  );

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "color-mix(in srgb, var(--bg) 92%, transparent)",
      backdropFilter: "blur(20px) saturate(160%)",
      WebkitBackdropFilter: "blur(20px) saturate(160%)",
      borderBottom: "0.5px solid var(--hairline)",
    }}>
      <style>{`
        .pq-pubnav-search { flex: 0 1 300px; }
        .pq-pubnav-tabs { display: flex; align-items: center; gap: 2px; margin-left: auto; }
        .pq-pubnav-actions { display: flex; align-items: center; gap: 8px; }
        .pq-pubnav-menu-btn { display: none; }
        .pq-pubnav-tab {
          padding: 8px 11px; border-radius: 8px; text-decoration: none;
          font-size: 14px; font-weight: 600; color: var(--ink-soft); white-space: nowrap;
          transition: background 120ms, color 120ms;
        }
        .pq-pubnav-tab:hover { background: color-mix(in srgb, var(--primary) 8%, transparent); color: var(--ink); }
        .pq-pubnav-tab[aria-current="page"] { color: var(--primary); font-weight: 700; }
        .pq-pubnav-row:hover { background: color-mix(in srgb, var(--primary) 6%, transparent) !important; }
        .pq-pubnav-group { padding: 8px 14px 4px; font-size: 11.5px; font-weight: 600; color: var(--ink-mute); }
        @media (max-width: 940px) {
          .pq-pubnav-search { flex: 1 1 auto; }
          .pq-pubnav-tabs, .pq-pubnav-actions { display: none; }
          .pq-pubnav-menu-btn { display: flex; }
        }
      `}</style>

      <div style={{ height: PUBLIC_NAV_HEIGHT, padding: "0 24px", display: "flex", alignItems: "center", gap: 18 }}>
        <Logo />
        <NavSearch />

        <nav className="pq-pubnav-tabs" aria-label="Main">
          {PUBLIC_NAV_LINKS.map((link) => (
            <Link
              key={link.id}
              href={publicHref(link, isSignedIn)}
              className="pq-pubnav-tab"
              aria-current={active === link.id ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="pq-pubnav-actions">{actions}</div>

        <button
          className="pq-pubnav-menu-btn"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          style={{
            background: "transparent", border: 0, cursor: "pointer", flexShrink: 0,
            padding: 6, borderRadius: 8, color: "var(--ink)", alignItems: "center",
          }}
        >
          {menuOpen ? <X style={{ width: 22, height: 22 }} strokeWidth={2} /> : <Menu style={{ width: 22, height: 22 }} strokeWidth={2} />}
        </button>
      </div>

      {menuOpen && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "var(--bg)", borderBottom: "0.5px solid var(--hairline)",
          boxShadow: "0 16px 32px rgba(0,0,0,0.12)", padding: "6px 16px 16px",
        }}>
          <nav aria-label="Main" style={{ display: "flex", flexDirection: "column" }}>
            {PUBLIC_NAV_LINKS.map((link) => (
              <Link
                key={link.id}
                href={publicHref(link, isSignedIn)}
                onClick={() => setMenuOpen(false)}
                className="pq-pubnav-tab"
                aria-current={active === link.id ? "page" : undefined}
                style={{ padding: "12px 8px", fontSize: 15 }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>{actions}</div>
        </div>
      )}
    </header>
  );
}
