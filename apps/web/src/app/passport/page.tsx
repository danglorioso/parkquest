"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { DesktopButton } from "@/components/desktop/DesktopButton";
import { HolographicShine } from "@/components/desktop/HolographicShine";
import { ParkStamp } from "@/components/desktop/ParkStamp";
import { PassportWatermark } from "@/components/desktop/PassportWatermark";
import type { CustomStampGlyph } from "@parkquest/types";

// ── Constants ─────────────────────────────────────────────────────────────────
// Ported from apps/mobile/app/(tabs)/profile/passport.tsx — passport-book
// aesthetic (paper, gold foil, stamp inks) is intentionally fixed, matching
// the mobile screen 1:1; only the cover color would follow the app palette
// if this page read it (kept as the fixed deep green mobile uses).

const PAPER = "#FAF3E0";
const GOLD = "#C9A94A";
const COVER = "#152A20";
const P_INK = "#3A2E1C";
const P_MUTE = "rgba(58,46,28,0.55)";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileInfo {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface Park {
  park_code: string;
  name: string;
  states: string;
  stamp_glyph: CustomStampGlyph | null;
}

interface Visit {
  park_code: string;
  is_bucket_list: boolean;
  visited_date: string | null;
  rating?: number | null;
}

interface StampItem {
  park_code: string;
  name: string;
  states: string;
  visited: boolean;
  visited_date: string | null;
  colorIdx: number;
  stamp_glyph: CustomStampGlyph | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function passportNo(username: string): string {
  const n = ((username.length * 73291 + 41023) % 9999999).toString().padStart(7, "0");
  return `PQ${n}`;
}

function stampDateStr(iso: string): string {
  const d = new Date(iso);
  const M = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ── StampCell ─────────────────────────────────────────────────────────────────

const CELL_W = 140;
const STAMP_D = 88;

function StampCell({ item, onPress }: { item: StampItem; onPress: () => void }) {
  const date = item.visited_date ? stampDateStr(item.visited_date) : "";
  return (
    <button
      onClick={onPress}
      style={{
        width: CELL_W, background: "transparent", border: "none", cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 0",
      }}
    >
      <ParkStamp parkCode={item.park_code} name={item.name} states={item.states} colorIdx={item.colorIdx} size={STAMP_D} customGlyph={item.stamp_glyph} />
      <div style={{ fontSize: 12, fontWeight: 600, color: P_INK, textAlign: "center", marginTop: 8, lineHeight: 1.3, maxWidth: CELL_W - 8 }}>
        {item.name}
      </div>
      {date && <div style={{ fontSize: 10.5, color: P_MUTE, textAlign: "center", marginTop: 2, fontFamily: "var(--font-mono)" }}>{date}</div>}
    </button>
  );
}

function StampPlaceholder({ item }: { item: StampItem }) {
  return (
    <div style={{ width: CELL_W, display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 0", opacity: 0.22 }}>
      <div
        style={{
          width: STAMP_D, height: STAMP_D, borderRadius: STAMP_D / 2,
          border: `1.5px dashed ${P_INK}`, display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 20, color: P_INK, lineHeight: 1 }}>+</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: P_INK, textAlign: "center", marginTop: 8, lineHeight: 1.3, maxWidth: CELL_W - 8 }}>
        {item.name}
      </div>
    </div>
  );
}

function SkeletonCell() {
  return (
    <div style={{ width: CELL_W, display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 0" }}>
      <div style={{ width: STAMP_D, height: STAMP_D, borderRadius: STAMP_D / 2, background: "rgba(58,46,28,0.08)" }} />
      <div style={{ width: CELL_W - 30, height: 8, borderRadius: 4, background: "rgba(58,46,28,0.06)", marginTop: 10 }} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PassportPage() {
  const { user } = useUser();
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [allParks, setAllParks] = useState<Park[]>([]);
  const [badgeCount, setBadgeCount] = useState(0);
  const [totalBadges, setTotalBadges] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Pure async fetch chain — no synchronous setState at the top, so this is
  // safe to call directly from the mount effect below.
  const fetchAll = () => {
    Promise.allSettled([
      fetch("/api/profile").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/visits").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/parks").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/badges").then((r) => (r.ok ? r.json() : { badges: [] })),
    ]).then(([profRes, visitsRes, parksRes, badgesRes]) => {
      if ([profRes, visitsRes, parksRes, badgesRes].every((r) => r.status === "rejected")) {
        setError(true);
      }
      if (profRes.status === "fulfilled" && profRes.value) setProfile(profRes.value);
      if (visitsRes.status === "fulfilled") setVisits(visitsRes.value ?? []);
      if (parksRes.status === "fulfilled") setAllParks(parksRes.value ?? []);
      if (badgesRes.status === "fulfilled") {
        const all = badgesRes.value?.badges ?? badgesRes.value ?? [];
        setBadgeCount(all.filter((b: { earned: boolean }) => b.earned).length);
        setTotalBadges(all.length);
      }
      setLoading(false);
    }).catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchAll(); }, []);

  // Retry button handler — an event handler, not an effect, so resetting
  // state synchronously here before re-fetching is fine.
  function handleRetry() {
    setLoading(true);
    setError(false);
    fetchAll();
  }

  // All parks: visited (chrono) first, then unvisited
  const allStampItems = useMemo((): StampItem[] => {
    const visitedMap = new Map<string, string>();
    visits.forEach((v) => {
      if (!v.is_bucket_list && v.visited_date) visitedMap.set(v.park_code, v.visited_date);
    });
    const visited: StampItem[] = [];
    const unvisited: StampItem[] = [];
    allParks.forEach((p, idx) => {
      const date = visitedMap.get(p.park_code) ?? null;
      const entry: StampItem = { park_code: p.park_code, name: p.name, states: p.states, visited: !!date, visited_date: date, colorIdx: idx, stamp_glyph: p.stamp_glyph };
      if (date) visited.push(entry);
      else unvisited.push(entry);
    });
    visited.sort((a, b) => (a.visited_date ?? "").localeCompare(b.visited_date ?? ""));
    return [...visited, ...unvisited];
  }, [allParks, visits]);

  const visitedCount = useMemo(() => allStampItems.filter((s) => s.visited).length, [allStampItems]);
  const bucketCount = useMemo(() => visits.filter((v) => v.is_bucket_list).length, [visits]);
  const tripsCount = useMemo(() => visits.filter((v) => !v.is_bucket_list && v.visited_date).length, [visits]);
  const statesCount = useMemo(() => {
    const s = new Set<string>();
    allStampItems.filter((si) => si.visited).forEach((si) => si.states.split(",").forEach((st) => s.add(st.trim())));
    return s.size;
  }, [allStampItems]);
  const totalParkStates = useMemo(() => {
    const s = new Set<string>();
    allStampItems.forEach((si) => si.states.split(",").forEach((st) => s.add(st.trim())));
    return s.size;
  }, [allStampItems]);

  const visitedStamps = useMemo(() => allStampItems.filter((s) => s.visited), [allStampItems]);
  const firstStamp = visitedStamps[0] ?? null;
  const latestStamp = visitedStamps.length > 1 ? visitedStamps[visitedStamps.length - 1] : null;

  const records = useMemo(() => {
    const parkName = (code: string) => allParks.find((p) => p.park_code === code)?.name?.replace(/ National Park.*$/, "") ?? code;
    const dated = visits.filter((v) => !v.is_bucket_list && v.visited_date);
    if (dated.length === 0) return { mostVisited: null as { name: string; detail: string } | null, topRated: null as { name: string; detail: string } | null };

    const counts = new Map<string, number>();
    dated.forEach((v) => counts.set(v.park_code, (counts.get(v.park_code) ?? 0) + 1));
    let mvCode: string | null = null, mvCount = 1;
    counts.forEach((n, code) => { if (n > mvCount) { mvCount = n; mvCode = code; } });

    const rated = dated.filter((v) => typeof v.rating === "number");
    const top = rated.sort((a, b) => (b.rating! - a.rating!) || (a.visited_date ?? "").localeCompare(b.visited_date ?? ""))[0] ?? null;

    return {
      mostVisited: mvCode ? { name: parkName(mvCode), detail: `${mvCount} visits` } : null,
      topRated: top ? { name: parkName(top.park_code), detail: "★".repeat(Math.round(top.rating!)) } : null,
    };
  }, [visits, allParks]);

  const avatarUrl = profile?.avatar_url || user?.imageUrl || null;
  const name = profile?.display_name ?? profile?.username ?? null;
  const pNo = passportNo(profile?.username ?? user?.username ?? "explorer");
  const joinDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  const mrzName = name ?? "Explorer";
  const mrzUsername = profile?.username ?? user?.username ?? "";
  const mrzLine1 = (() => {
    const parts = mrzName.toUpperCase().replace(/[^A-Z ]/g, "").split(" ");
    const surname = (parts[0] ?? "UNKNOWN").slice(0, 12);
    const given = (parts.slice(1).join("<") || "EXPLORER").slice(0, 10);
    return `P<USA<<${surname}<<${given}`.padEnd(44, "<").slice(0, 44);
  })();
  const mrzLine2 = (() => {
    const uid = user?.id?.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(-7).padStart(7, "0") ?? "0000000";
    const joined = user?.createdAt ? new Date(user.createdAt).toISOString().slice(2, 10).replace(/-/g, "") : "000000";
    const parks3 = String(visitedCount).padStart(3, "0");
    const uname = mrzUsername.toUpperCase().slice(0, 9).padEnd(9, "<");
    return `${uid}<USA${joined}${parks3}${uname}`.padEnd(44, "<").slice(0, 44);
  })();

  // Divider after every 12 stamps (one "book page") — grid items with
  // gridColumn: '1 / -1' span full width regardless of the responsive
  // column count, same effect as mobile's fixed 3-per-row page break.
  const ROWS_PER_PAGE_ITEMS = 12;

  if (error && allParks.length === 0 && !loading) {
    return (
      <DesktopShell>
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
          <div style={{ color: "var(--ink-mute)", fontSize: 15, fontWeight: 600 }}>Failed to load</div>
          <DesktopButton size="sm" onClick={handleRetry}>Retry</DesktopButton>
        </div>
      </DesktopShell>
    );
  }

  return (
    <DesktopShell>
      <div style={{ height: "100%", overflowY: "auto" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 32px 56px" }}>

          {/* ── Cover ── */}
          <div
            style={{
              position: "relative",
              borderRadius: 20,
              overflow: "hidden",
              background: `radial-gradient(120% 100% at 50% 0%, #1F3D2E 0%, ${COVER} 60%, #0D1D15 100%)`,
              boxShadow: "0 16px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)",
              border: "0.5px solid rgba(0,0,0,0.3)",
              borderBottom: `3px solid ${GOLD}44`,
            }}
          >
            <HolographicShine edgeTextSize={26} edgeTextSpan={[0.14, 0.86]} />

            <div style={{ position: "relative", padding: "26px 28px 22px" }}>
              {/* Kicker — bleeds edge to edge, single line, clipped not wrapped */}
              <div
                style={{
                  fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: "1.8px", opacity: 0.8,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip", marginBottom: 18,
                }}
              >
                PARKQUEST.ME · NATIONAL PARK PASSPORT · OFFICIAL RECORD OF VISITATION
              </div>

              {/* Identity */}
              <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 20 }}>
                <div
                  style={{
                    width: 78, height: 78, borderRadius: 39, border: `2px solid ${GOLD}66`,
                    overflow: "hidden", flexShrink: 0, background: "#1F3D2E",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={name ?? "avatar"} style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.15)" }} />
                  ) : name ? (
                    <span style={{ fontSize: 28, fontWeight: 900, color: GOLD }}>{name.slice(0, 2).toUpperCase()}</span>
                  ) : null}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {name ? (
                    <div style={{ fontSize: 27, fontWeight: 800, color: GOLD, letterSpacing: -0.4, textShadow: "0 1px 3px rgba(0,0,0,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {name}
                    </div>
                  ) : (
                    <>
                      <div style={{ width: 180, height: 30, borderRadius: 6, background: "rgba(201,169,74,0.25)" }} />
                      <div style={{ width: 110, height: 16, borderRadius: 5, background: "rgba(201,169,74,0.18)", marginTop: 6 }} />
                    </>
                  )}
                  {profile?.username && (
                    <div style={{ fontSize: 15, fontWeight: 600, color: GOLD, opacity: 0.75, letterSpacing: 0.4, marginTop: 3 }}>@{profile.username}</div>
                  )}
                  {joinDate && (
                    <div style={{ fontSize: 13, fontWeight: 500, color: GOLD, opacity: 0.6, letterSpacing: 0.3, marginTop: 3 }}>Joined {joinDate}</div>
                  )}
                </div>
              </div>

              {/* Watermark band */}
              <div style={{ margin: "0 -28px 14px", fontSize: 10, fontWeight: 800, letterSpacing: "2.4px", color: "rgba(201,169,74,0.22)", whiteSpace: "nowrap", overflow: "hidden" }}>
                {"PARKQUEST • ".repeat(20)}
              </div>

              {/* Stats plate */}
              <div style={{ background: "rgba(8,16,12,0.42)", borderRadius: 14, padding: "4px 8px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", padding: "12px 0", marginBottom: 10 }}>
                  {[
                    { label: "TRIPS", value: loading ? "–" : String(tripsCount) },
                    { label: "STATES", value: loading ? "–" : `${statesCount}/${totalParkStates}` },
                    { label: "BUCKET", value: loading ? "–" : String(bucketCount), onPress: () => router.push("/parks?status=bucketList") },
                    { label: "BADGES", value: loading ? "–" : `${badgeCount}/${totalBadges}` },
                  ].map((s, i) => {
                    const Wrap = s.onPress ? "button" : "div";
                    return (
                      <Wrap
                        key={s.label}
                        {...(s.onPress ? { onClick: s.onPress } : {})}
                        style={{
                          textAlign: "center", background: "transparent", border: "none", cursor: s.onPress ? "pointer" : "default",
                          borderLeft: i > 0 ? "0.5px solid rgba(201,169,74,0.3)" : undefined,
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: "1.5px", opacity: 0.85 }}>{s.label}</div>
                        <div style={{ fontSize: 30, fontWeight: 800, color: GOLD, letterSpacing: -0.5, marginTop: 2, textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>{s.value}</div>
                      </Wrap>
                    );
                  })}
                </div>

                <div style={{ paddingBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: GOLD, opacity: 0.75, letterSpacing: 0.5, marginLeft: 16, marginBottom: 6 }}>
                    {loading ? "Loading…" : `${visitedCount} of 63 parks stamped`}
                  </div>
                  <div style={{ height: 3, margin: "0 16px", background: `${GOLD}22`, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: 3, width: `${(visitedCount / 63) * 100}%`, background: GOLD, borderRadius: 2, opacity: 0.9, transition: "width 500ms" }} />
                  </div>
                </div>
              </div>

              {/* First/latest stamp chips */}
              {!loading && firstStamp && (
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  {([
                    { label: "FIRST STAMP", item: firstStamp },
                    ...(latestStamp ? [{ label: "LATEST STAMP", item: latestStamp }] : []),
                  ]).map(({ label, item: s }) => (
                    <button
                      key={label}
                      onClick={() => router.push(`/parks/${s.park_code}`)}
                      style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 8px" }}
                    >
                      <div style={{ fontSize: 9, fontWeight: 700, color: GOLD, opacity: 0.75, letterSpacing: "1.5px" }}>{label}</div>
                      <ParkStamp parkCode={s.park_code} name={s.name} states={s.states} colorIdx={s.colorIdx} size={92} idSuffix="-chip" inkColor={GOLD} customGlyph={s.stamp_glyph} />
                      {s.visited_date && (
                        <div style={{ fontSize: 10, color: GOLD, opacity: 0.65, fontFamily: "var(--font-mono)" }}>{stampDateStr(s.visited_date)}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Records */}
              {!loading && (records.mostVisited || records.topRated) && (
                <div style={{ background: "rgba(8,16,12,0.42)", borderRadius: 14, padding: "4px 8px", marginTop: 10 }}>
                  {([
                    { label: "MOST VISITED", rec: records.mostVisited },
                    { label: "TOP RATED", rec: records.topRated },
                  ] as const).filter((r) => r.rec).map((r, i) => (
                    <div
                      key={r.label}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                        padding: "9px 6px", borderTop: i > 0 ? "0.5px solid rgba(201,169,74,0.18)" : undefined,
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: "1.5px", opacity: 0.75, flexShrink: 0 }}>{r.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, letterSpacing: 0.2, textShadow: "0 1px 2px rgba(0,0,0,0.4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.rec!.name} <span style={{ fontWeight: 600, opacity: 0.7 }}>· {r.rec!.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Passport number */}
              <div style={{ marginTop: 10, fontSize: 10, fontWeight: 600, color: GOLD, letterSpacing: "1.1px", opacity: 0.65 }}>
                NO · {pNo}
              </div>

              {/* MRZ strip */}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "0.5px solid rgba(201,169,74,0.15)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(201,169,74,0.35)", letterSpacing: "1.5px", lineHeight: 1.5, whiteSpace: "nowrap", overflow: "hidden" }}>{mrzLine1}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(201,169,74,0.35)", letterSpacing: "1.5px", lineHeight: 1.5, whiteSpace: "nowrap", overflow: "hidden" }}>{mrzLine2}</div>
              </div>
            </div>
          </div>

          {/* Bio — kept on paper below the cover */}
          {profile?.bio && (
            <div style={{ padding: "16px 6px 4px" }}>
              <div style={{ fontSize: 13, fontStyle: "italic", color: P_INK, opacity: 0.75, lineHeight: 1.5 }}>{profile.bio}</div>
            </div>
          )}

          {/* ── Paper page: stamp grid ── */}
          <div
            style={{
              position: "relative", marginTop: 20, borderRadius: 20, overflow: "hidden",
              background: PAPER, border: "0.5px solid var(--hairline)",
              boxShadow: "0 8px 22px rgba(58,42,18,0.10)", padding: "26px 24px 30px",
            }}
          >
            <PassportWatermark />
            <div style={{ position: "relative" }}>
              {loading ? (
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 8px" }}>
                  {Array.from({ length: 9 }).map((_, i) => <SkeletonCell key={i} />)}
                </div>
              ) : allStampItems.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 32 }}>🏕</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: P_INK }}>No stamps yet</div>
                  <div style={{ fontSize: 13, color: P_MUTE, lineHeight: 1.5, maxWidth: 320 }}>Log your first park visit to earn your first stamp.</div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${CELL_W}px, 1fr))`, justifyItems: "center" }}>
                  {allStampItems.map((item, i) => (
                    <Fragment key={item.park_code}>
                      {i > 0 && i % ROWS_PER_PAGE_ITEMS === 0 && (
                        <div
                          style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}
                        >
                          <div style={{ flex: 1, height: 0.5, background: `${GOLD}88` }} />
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#A87E2C", letterSpacing: 2 }}>
                            · {Math.floor(i / ROWS_PER_PAGE_ITEMS) + 1} ·
                          </div>
                          <div style={{ flex: 1, height: 0.5, background: `${GOLD}88` }} />
                        </div>
                      )}
                      {item.visited ? (
                        <StampCell item={item} onPress={() => router.push(`/parks/${item.park_code}`)} />
                      ) : (
                        <StampPlaceholder item={item} />
                      )}
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DesktopShell>
  );
}
