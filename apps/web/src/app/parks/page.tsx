"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Search, X, Check, Bookmark, Plus } from "lucide-react";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import Logo from "@/components/Logo";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Park {
  park_code: string;
  name: string;
  states: string;
  description: string | null;
  latitude: string | null;
  longitude: string | null;
  image_url: string | null;
}

interface Visit {
  park_code: string;
  is_bucket_list: boolean;
  visited_date: string | null;
}

type StatusFilter = "all" | "visited" | "bucketList" | "notVisited";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "Washington D.C.", AS: "American Samoa", GU: "Guam", MP: "Northern Mariana Islands",
  PR: "Puerto Rico", VI: "U.S. Virgin Islands",
};

const GRADIENTS = [
  ["#1F3D2E", "#2F7A4A", "#C56B3D"],
  ["#2D4F66", "#1F3D2E", "#D89A3A"],
  ["#7B3A1F", "#C56B3D", "#1F3D2E"],
  ["#3A2E5C", "#6E97A3", "#D89A3A"],
  ["#2F7A4A", "#1F3D2E", "#2D4F66"],
];

function parkGradient(code: string) {
  const idx = code.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length;
  const [a, b, c] = GRADIENTS[idx];
  return `linear-gradient(160deg, ${a} 0%, ${b} 55%, ${c} 130%)`;
}

function parkStatus(code: string, visits: Visit[]): "visited" | "bucketList" | "notVisited" {
  const parkVisits = visits.filter((v) => v.park_code === code);
  if (parkVisits.some((v) => !v.is_bucket_list && v.visited_date)) return "visited";
  if (parkVisits.some((v) => v.is_bucket_list)) return "bucketList";
  return "notVisited";
}

const STATUS_LABEL: Record<string, string> = {
  visited: "Visited",
  bucketList: "Bucket list",
  notVisited: "Not visited",
};


// ── Regions ───────────────────────────────────────────────────────────────────

const REGIONS: { label: string; states: string[] }[] = [
  { label: "Northeast",     states: ["CT", "ME", "MA", "NH", "NJ", "NY", "PA", "RI", "VT"] },
  { label: "Mid-Atlantic",  states: ["DC", "DE", "MD", "NC", "VA", "WV"] },
  { label: "Southeast",     states: ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "SC", "TN"] },
  { label: "Midwest",       states: ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"] },
  { label: "Southwest",     states: ["AZ", "NM", "OK", "TX"] },
  { label: "Mountain West", states: ["CO", "ID", "MT", "NV", "UT", "WY"] },
  { label: "Pacific Coast", states: ["CA", "OR", "WA"] },
  { label: "Alaska",        states: ["AK"] },
  { label: "Hawaii",        states: ["HI"] },
  { label: "Territories",   states: ["AS", "GU", "MP", "PR", "VI"] },
];

// ── Skeleton ──────────────────────────────────────────────────────────────────

function topoPattern(color: string, opacity: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420' viewBox='0 0 420 420'><g fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-width='1'><path d='M-20 60 Q 60 30 130 60 T 280 60 T 440 60'/><path d='M-20 110 Q 60 80 130 110 T 280 110 T 440 110'/><path d='M-20 160 Q 60 130 130 160 T 280 160 T 440 160'/><path d='M-20 210 Q 60 180 130 210 T 280 210 T 440 210'/><path d='M-20 260 Q 60 230 130 260 T 280 260 T 440 260'/><path d='M-20 310 Q 60 280 130 310 T 280 310 T 440 310'/><path d='M-20 360 Q 60 330 130 360 T 280 360 T 440 360'/><path d='M-20 410 Q 60 380 130 410 T 280 410 T 440 410'/></g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

const SKELETON_GRADIENTS = [
  ["#1F3D2E", "#2F7A4A"],
  ["#2D4F66", "#1F3D2E"],
  ["#7B3A1F", "#C56B3D"],
  ["#3A2E5C", "#6E97A3"],
  ["#2F7A4A", "#2D4F66"],
  ["#1F3D2E", "#3A2E5C"],
];

function CardSkeleton({ index }: { index: number }) {
  const [a, b] = SKELETON_GRADIENTS[index % SKELETON_GRADIENTS.length];
  const gradient = `linear-gradient(160deg, ${a} 0%, ${b} 100%)`;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "0.5px solid var(--hairline)",
        borderRadius: 14,
        overflow: "hidden",
        animation: "pqSkeleton 1.6s ease-in-out infinite",
        animationDelay: `${(index % 6) * 0.08}s`,
      }}
    >
      <style>{`@keyframes pqSkeleton { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
      <div style={{ height: 120, background: gradient, backgroundImage: topoPattern("#ffffff", 0.10) }} />
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ width: 48, height: 9, borderRadius: 4, background: "var(--surface-alt)" }} />
        <div style={{ width: "80%", height: 14, borderRadius: 5, background: "var(--surface-alt)" }} />
        <div style={{ width: "100%", height: 11, borderRadius: 4, background: "var(--surface-alt)" }} />
        <div style={{ width: "65%", height: 11, borderRadius: 4, background: "var(--surface-alt)" }} />
      </div>
    </div>
  );
}

// ── ParkCard ──────────────────────────────────────────────────────────────────

function ParkCard({ park, status, showStatus = true }: { park: Park; status: "visited" | "bucketList" | "notVisited"; showStatus?: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  const gradient = parkGradient(park.park_code);
  const stateAbbr = park.states.split(",")[0]?.trim() ?? park.states;
  const state = STATE_NAMES[stateAbbr] ?? stateAbbr;

  return (
    <Link href={`/parks/${park.park_code}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          background: "var(--surface)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 14,
          overflow: "hidden",
          cursor: "pointer",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 24px rgba(0,0,0,0.10)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
          (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
        }}
      >
        {/* Cover image / color band */}
        <div style={{ height: 120, position: "relative", background: gradient, overflow: "hidden" }}>
          {park.image_url && !imgFailed && (
            <Image
              src={park.image_url}
              alt={park.name}
              fill
              sizes="320px"
              style={{ objectFit: "cover" }}
              onError={() => setImgFailed(true)}
            />
          )}
          {/* Gradient overlay so badge stays readable over photos */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 50%)" }} />
          {showStatus && (
            <div
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                background:
                  status === "visited"    ? "#2F7A4A" :
                  status === "bucketList" ? "#C48A20" :
                  "rgba(30,30,30,0.52)",
                backdropFilter: status === "notVisited" ? "blur(6px)" : undefined,
                borderRadius: 100,
                padding: "4px 10px",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {status === "visited"    && <Check    size={10} strokeWidth={2.8} color="#fff" />}
              {status === "bucketList" && <Bookmark size={10} strokeWidth={2.5} color="#fff" />}
              {status === "notVisited" && <Plus     size={10} strokeWidth={2.8} color="#fff" />}
              <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", letterSpacing: "0.3px" }}>
                {STATUS_LABEL[status]}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ padding: "12px 14px 14px" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--ink-mute)",
              letterSpacing: "1px",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {state}
          </div>
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--ink)", lineHeight: 1.2, letterSpacing: -0.2 }}>
            {park.name}
          </div>
          {park.description && (
            <div
              style={{
                fontSize: 11.5,
                color: "var(--ink-mute)",
                marginTop: 6,
                lineHeight: 1.5,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {park.description}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── FilterSidebar ─────────────────────────────────────────────────────────────

interface FilterSidebarProps {
  parks: Park[];
  visits: Visit[];
  activitiesMap: Record<string, string[]>;
  topicsMap: Record<string, string[]>;
  loading: boolean;
  filtersLoading: boolean;
  statusFilter: StatusFilter;
  onStatusFilter: (s: StatusFilter) => void;
  stateFilter: string;
  onStateFilter: (s: string) => void;
  activityFilters: string[];
  onActivityToggle: (a: string) => void;
  onClearActivities: () => void;
  topicFilters: string[];
  onTopicToggle: (t: string) => void;
  onClearTopics: () => void;
  onResetAll: () => void;
  isPublic?: boolean;
}

function FilterSidebar({
  parks, visits, activitiesMap, topicsMap, loading, filtersLoading,
  statusFilter, onStatusFilter,
  stateFilter, onStateFilter,
  activityFilters, onActivityToggle, onClearActivities,
  topicFilters, onTopicToggle, onClearTopics,
  onResetAll,
  isPublic = false,
}: FilterSidebarProps) {
  const visitedCount = useMemo(() => parks.filter((p) => parkStatus(p.park_code, visits) === "visited").length, [parks, visits]);
  const bucketCount = useMemo(() => parks.filter((p) => parkStatus(p.park_code, visits) === "bucketList").length, [parks, visits]);
  const notYetCount = parks.length - visitedCount - bucketCount;

  const allActivities = useMemo(() => {
    const freq: Record<string, number> = {};
    parks.forEach((p) => {
      (activitiesMap[p.park_code] ?? []).forEach((a) => { freq[a] = (freq[a] ?? 0) + 1; });
    });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name).slice(0, 35);
    const extras = activityFilters.filter((a) => !top.includes(a));
    return [...extras, ...top];
  }, [parks, activitiesMap, activityFilters]);

  const allTopics = useMemo(() => {
    const freq: Record<string, number> = {};
    parks.forEach((p) => {
      (topicsMap[p.park_code] ?? []).forEach((t) => { freq[t] = (freq[t] ?? 0) + 1; });
    });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name).slice(0, 55);
    const extras = topicFilters.filter((t) => !top.includes(t));
    return [...extras, ...top];
  }, [parks, topicsMap, topicFilters]);

  const rowStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 10px",
    borderRadius: 8,
    cursor: "pointer",
    background: active ? "rgba(31,61,46,0.08)" : "transparent",
    border: "none",
    width: "100%",
    textAlign: "left",
    gap: 8,
  });

  const sectionLabel: React.CSSProperties = {
    padding: "4px 10px 6px",
    fontFamily: "var(--font-mono)",
    fontSize: 8.5,
    letterSpacing: "1.2px",
    color: "var(--ink-mute)",
    textTransform: "uppercase",
    fontWeight: 700,
  };

  const hasActiveFilters = statusFilter !== "all" || stateFilter !== "all" || activityFilters.length > 0 || topicFilters.length > 0;

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: "0.5px solid var(--hairline)",
        padding: "28px 0 28px",
        overflowY: "auto",
        background: "var(--bg)",
      }}
    >
      <div style={{ padding: "0 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "1.6px", color: "var(--ink-mute)", textTransform: "uppercase", fontWeight: 600 }}>
          Filters
        </span>
        <button
          onClick={onResetAll}
          style={{
            background: "none", border: "none", cursor: "pointer", fontSize: 10,
            fontFamily: "var(--font-mono)", fontWeight: 700, padding: 0, letterSpacing: "0.4px",
            color: "var(--primary)",
            visibility: hasActiveFilters ? "visible" : "hidden",
          }}
        >
          Reset
        </button>
      </div>

      {/* Status — hidden for public/unauthenticated view */}
      {!isPublic && (
        <>
          <div style={{ padding: "0 8px 20px" }}>
            <div style={sectionLabel}>Status</div>
            {([
              { value: "all",        label: "All parks",   count: parks.length },
              { value: "visited",    label: "Visited",     count: visitedCount },
              { value: "bucketList", label: "Bucket list", count: bucketCount },
              { value: "notVisited", label: "Not yet",     count: notYetCount },
            ] as { value: StatusFilter; label: string; count: number }[]).map(({ value, label, count }) => (
              <button key={value} onClick={() => onStatusFilter(value)} style={rowStyle(statusFilter === value)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {value !== "all" && (
                    <div style={{
                      width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                      background: value === "visited" ? "#2F7A4A" : value === "bucketList" ? "#D89A3A" : "transparent",
                      border: value === "notVisited" ? "1.5px solid var(--ink-mute)" : "none",
                    }} />
                  )}
                  <span style={{ fontSize: 12.5, fontWeight: statusFilter === value ? 700 : 500, color: statusFilter === value ? "var(--primary)" : "var(--ink)" }}>
                    {label}
                  </span>
                </div>
                {!loading && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)", fontWeight: 600 }}>{count}</span>}
              </button>
            ))}
          </div>

          <div style={{ height: "0.5px", background: "var(--hairline)", margin: "0 16px 20px" }} />
        </>
      )}

      {/* Location — states grouped by region */}
      <div style={{ padding: "0 8px 20px" }}>
        <div style={sectionLabel}>Location</div>
        <button onClick={() => onStateFilter("all")} style={rowStyle(stateFilter === "all")}>
          <span style={{ fontSize: 12.5, fontWeight: stateFilter === "all" ? 700 : 500, color: stateFilter === "all" ? "var(--primary)" : "var(--ink)" }}>
            All regions
          </span>
        </button>
        {REGIONS.map((region) => (
          <button key={region.label} onClick={() => onStateFilter(region.label)} style={rowStyle(stateFilter === region.label)}>
            <span style={{ fontSize: 12.5, fontWeight: stateFilter === region.label ? 700 : 500, color: stateFilter === region.label ? "var(--primary)" : "var(--ink)" }}>
              {region.label}
            </span>
          </button>
        ))}
      </div>

      <div style={{ height: "0.5px", background: "var(--hairline)", margin: "0 16px 20px" }} />

      {/* Activities */}
      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ ...sectionLabel, padding: 0 }}>Activities</span>
          {activityFilters.length > 0 && (
            <button onClick={onClearActivities} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontWeight: 600, padding: 0 }}>
              CLEAR
            </button>
          )}
        </div>
        {filtersLoading ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[52, 72, 60, 88, 48, 68].map((w, i) => (
              <div key={i} style={{ height: 26, width: w, borderRadius: 100, background: "var(--surface-alt)", opacity: 0.7 }} />
            ))}
          </div>
        ) : allActivities.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {allActivities.map((activity) => (
              <button key={activity} onClick={() => onActivityToggle(activity)} style={chipStyle(activityFilters.includes(activity))}>
                {activity}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ height: "0.5px", background: "var(--hairline)", margin: "0 16px 20px" }} />

      {/* Topics */}
      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ ...sectionLabel, padding: 0 }}>Topics</span>
          {topicFilters.length > 0 && (
            <button onClick={onClearTopics} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontWeight: 600, padding: 0 }}>
              CLEAR
            </button>
          )}
        </div>
        {filtersLoading ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[64, 80, 56, 72, 48, 60].map((w, i) => (
              <div key={i} style={{ height: 26, width: w, borderRadius: 100, background: "var(--surface-alt)", opacity: 0.7 }} />
            ))}
          </div>
        ) : allTopics.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {allTopics.map((topic) => (
              <button key={topic} onClick={() => onTopicToggle(topic)} style={chipStyle(topicFilters.includes(topic))}>
                {topic}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "5px 11px",
    borderRadius: 100,
    border: active ? "0.5px solid var(--primary)" : "0.5px solid var(--hairline)",
    background: active ? "var(--primary)" : "var(--surface)",
    color: active ? "#FFFBF1" : "var(--ink)",
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.12s ease",
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

function ParksPageContent() {
  const { isLoaded, isSignedIn } = useUser();

  const [loading, setLoading] = useState(true);
  const [parks, setParks] = useState<Park[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [activitiesMap, setActivitiesMap] = useState<Record<string, string[]>>({});
  const [topicsMap, setTopicsMap] = useState<Record<string, string[]>>({});
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const s = searchParams.get("status");
    if (s === "visited" || s === "bucketList" || s === "notVisited") return s;
    return "all";
  });
  const [activityFilters, setActivityFilters] = useState<string[]>(() => {
    const a = searchParams.get("activity");
    return a ? [decodeURIComponent(a)] : [];
  });
  const [topicFilters, setTopicFilters] = useState<string[]>(() => {
    const t = searchParams.get("topic");
    return t ? [decodeURIComponent(t)] : [];
  });

  useEffect(() => {
    if (!isLoaded) return;

    const parksPromise = fetch("/api/parks").then((r) => r.ok ? r.json() : []);
    const visitsPromise = isSignedIn
      ? fetch("/api/visits").then((r) => r.ok ? r.json() : [])
      : Promise.resolve([]);

    Promise.all([parksPromise, visitsPromise]).then(([p, v]) => {
      setParks(p);
      setVisits(v);
      setLoading(false);
    });

    // Activities and topics are slow (NPS API) — load lazily in background
    Promise.all([
      fetch("/api/parks/activities").then((r) => r.ok ? r.json() : {}),
      fetch("/api/parks/topics").then((r) => r.ok ? r.json() : {}),
    ]).then(([a, t]) => {
      setActivitiesMap(a);
      setTopicsMap(t);
      setFiltersLoading(false);
    });
  }, [isLoaded, isSignedIn]);

  const toggleActivity = (activity: string) => {
    setActivityFilters((prev) =>
      prev.includes(activity) ? prev.filter((a) => a !== activity) : [...prev, activity]
    );
  };

  const toggleTopic = (topic: string) => {
    setTopicFilters((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const filtered = useMemo(() => {
    return parks.filter((p) => {
      const status = parkStatus(p.park_code, visits);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (stateFilter !== "all") {
        const region = REGIONS.find((r) => r.label === stateFilter);
        const parkStates = p.states.split(",").map((s) => s.trim());
        if (!region || !parkStates.some((s) => region.states.includes(s))) return false;
      }
      if (activityFilters.length > 0) {
        const parkActivities = activitiesMap[p.park_code] ?? [];
        if (!activityFilters.every((a) => parkActivities.includes(a))) return false;
      }
      if (topicFilters.length > 0) {
        const parkTopics = topicsMap[p.park_code] ?? [];
        if (!topicFilters.every((t) => parkTopics.includes(t))) return false;
      }
      if (query) {
        const q = query.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.states.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [parks, visits, activitiesMap, topicsMap, query, statusFilter, stateFilter, activityFilters, topicFilters]);

  const visitedCount = useMemo(() => parks.filter((p) => parkStatus(p.park_code, visits) === "visited").length, [parks, visits]);

  const hasFilter = query || statusFilter !== "all" || stateFilter !== "all" || activityFilters.length > 0 || topicFilters.length > 0;

  const filterSidebarProps = {
    parks,
    visits,
    activitiesMap,
    topicsMap,
    loading,
    filtersLoading,
    statusFilter,
    onStatusFilter: setStatusFilter,
    stateFilter,
    onStateFilter: setStateFilter,
    activityFilters,
    onActivityToggle: toggleActivity,
    onClearActivities: () => setActivityFilters([]),
    topicFilters,
    onTopicToggle: toggleTopic,
    onClearTopics: () => setTopicFilters([]),
    onResetAll: () => { setStatusFilter("all"); setStateFilter("all"); setActivityFilters([]); setTopicFilters([]); setQuery(""); },
  };

  const parkGrid = (
    <>
      {hasFilter && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)", letterSpacing: "1px", marginBottom: 14, fontWeight: 600 }}>
          {filtered.length} RESULT{filtered.length !== 1 ? "S" : ""}
        </div>
      )}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {Array.from({ length: 18 }).map((_, i) => <CardSkeleton key={i} index={i} />)}
        </div>
      ) : filtered.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {filtered.map((park) => (
            <ParkCard key={park.park_code} park={park} status={parkStatus(park.park_code, visits)} showStatus={isSignedIn} />
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--ink-mute)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏔</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)", marginBottom: 6 }}>No parks found</div>
          <div style={{ fontSize: 13 }}>Try adjusting your search or filters.</div>
        </div>
      )}
    </>
  );

  // Public layout for unauthenticated users
  if (isLoaded && !isSignedIn) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        {/* Public top nav */}
        <div style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "rgba(245,239,224,0.92)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          borderBottom: "0.5px solid var(--hairline)",
          padding: "0 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: 54,
        }}>
          <Logo />
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/sign-in" style={{ textDecoration: "none" }}>
              <button style={{
                background: "transparent", border: "0.5px solid var(--hairline)",
                borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600,
                color: "var(--ink)", cursor: "pointer",
              }}>Sign in</button>
            </Link>
            <Link href="/sign-up" style={{ textDecoration: "none" }}>
              <button style={{
                background: "var(--primary)", border: "none",
                borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700,
                color: "#FFFBF1", cursor: "pointer",
              }}>Get started</button>
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", height: "calc(100vh - 54px)", overflow: "hidden" }}>
          <FilterSidebar {...filterSidebarProps} isPublic />

          <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
            <div style={{ padding: "28px 32px", paddingBottom: 100 }}>
              {/* Header */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "1.6px", color: "var(--ink-mute)", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
                  <span style={{ visibility: loading ? "hidden" : "visible" }}>{parks.length} National Parks</span>
                </div>
                <div style={{ fontWeight: 900, fontSize: 30, color: "var(--ink)", letterSpacing: -0.8 }}>
                  Explore the Parks
                </div>
              </div>

              {/* Search bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 12, padding: "10px 14px", marginBottom: 20 }}>
                <Search size={15} style={{ color: "var(--ink-mute)", flexShrink: 0 }} strokeWidth={2} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search parks…"
                  style={{ flex: 1, border: 0, outline: "none", background: "transparent", fontSize: 14, fontWeight: 500, color: "var(--ink)", fontFamily: "var(--font-sans)" }}
                />
                {query && (
                  <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-mute)", display: "flex", padding: 0 }}>
                    <X size={14} />
                  </button>
                )}
              </div>

              {parkGrid}
            </div>
          </div>
        </div>

        {/* Sticky sign-up banner */}
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
          background: "var(--primary)", padding: "16px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#FFFBF1" }}>
              Track your national park adventures
            </div>
            <div style={{ fontSize: 12.5, color: "rgba(255,251,241,0.75)", marginTop: 2 }}>
              Log visits, earn badges, and connect with friends who love the outdoors.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <Link href="/sign-in" style={{ textDecoration: "none" }}>
              <button style={{
                background: "rgba(255,251,241,0.15)", border: "1px solid rgba(255,251,241,0.35)",
                borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600,
                color: "#FFFBF1", cursor: "pointer",
              }}>Sign in</button>
            </Link>
            <Link href="/sign-up" style={{ textDecoration: "none" }}>
              <button style={{
                background: "#FFFBF1", border: "none",
                borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700,
                color: "var(--primary)", cursor: "pointer",
              }}>Create free account</button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated layout
  return (
    <DesktopShell fullbleed>
      <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

        <FilterSidebar {...filterSidebarProps} />

        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          <div style={{ padding: "28px 32px" }}>

            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "1.6px", color: "var(--ink-mute)", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
                <span style={{ visibility: loading ? "hidden" : "visible" }}>{parks.length} National Parks</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 900, fontSize: 30, color: "var(--ink)", letterSpacing: -0.8 }}>
                  Explore the Parks
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)", fontWeight: 600 }}>
                  {visitedCount} / {parks.length} visited
                </div>
              </div>
            </div>

            {/* Search bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "var(--surface)",
                border: "0.5px solid var(--hairline)",
                borderRadius: 12,
                padding: "10px 14px",
                marginBottom: 20,
              }}
            >
              <Search size={15} style={{ color: "var(--ink-mute)", flexShrink: 0 }} strokeWidth={2} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search parks…"
                style={{
                  flex: 1,
                  border: 0,
                  outline: "none",
                  background: "transparent",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--ink)",
                  fontFamily: "var(--font-sans)",
                }}
              />
              {query && (
                <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-mute)", display: "flex", padding: 0 }}>
                  <X size={14} />
                </button>
              )}
            </div>

            {parkGrid}
          </div>
        </div>
      </div>
    </DesktopShell>
  );
}

export default function ParksPage() {
  return (
    <Suspense>
      <ParksPageContent />
    </Suspense>
  );
}
