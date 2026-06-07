"use client";

import React from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { type FilterStatus } from "@/components/desktop/MapLeftPanel";
import { MapRightPanel } from "@/components/desktop/MapRightPanel";
import { MapSpotlight } from "@/components/desktop/MapSpotlight";
import { LogVisitModal } from "@/components/LogVisitModal";
import type { VisitDraft } from "@/components/LogVisitModal";
import type { NpsSummary } from "@/app/api/parks/nps-all/route";

const USAMap = dynamic(() => import("@/components/USAMapGL"), {
  ssr: false,
  loading: () => <div className="h-full w-full" style={{ background: "#CECDBC" }} />,
});

interface ParkFromDB {
  park_code: string;
  name: string;
  states: string;
  latitude: string | null;
  longitude: string | null;
  description: string | null;
  image_url: string | null;
}

export interface VisitEntry {
  id: number;
  visited_date: string;
  end_date?: string | null;
  title?: string | null;
  notes?: string | null;
}

interface ParkForMap {
  park_code: string;
  name: string;
  states: string;
  position: [number, number];
  status: 'visited' | 'notVisited' | 'bucketList';
  description?: string;
  visitedDate?: string | null;
  visitedEndDate?: string | null;
  title?: string | null;
  notes?: string | null;
  photos?: string[] | null;
  visibility?: string | null;
  visits?: VisitEntry[];
  image_url?: string | null;
}


export default function Home() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();

  const [parks, setParks] = useState<ParkForMap[]>([]);
  const [visitedParksCount, setVisitedParksCount] = useState(0);
  const [npsCache, setNpsCache] = useState<Record<string, NpsSummary>>({});
  const [logVisitOpen, setLogVisitOpen] = useState(false);
  const [logVisitDraft, setLogVisitDraft] = useState<Partial<VisitDraft> | undefined>(undefined);
  const [logVisitEditMode, setLogVisitEditMode] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [selectedParkCode, setSelectedParkCode] = useState<string | null>(null);
  const initialFlyDoneRef = useRef(false);
  const initialParkCodeRef = useRef<string | null>(null);

  // Derive selected park from parks state so it auto-updates after status changes
  const selectedPark = selectedParkCode
    ? parks.find((p) => p.park_code === selectedParkCode) ?? null
    : null;

  useEffect(() => {
    if (!isSignedIn && isLoaded) {
      router.push('/');
    }
  }, [isSignedIn, isLoaded, router]);

  // Read ?park= from URL on mount and pre-select that park
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("park");
    if (code) {
      initialParkCodeRef.current = code;
      setSelectedParkCode(code);
    }
  }, []);

  const [spotOpen, setSpotOpen] = useState(false);
  const [flyToTarget, setFlyToTarget] = useState<{ coords: [number, number]; rightPadding: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const fetchParksAndVisits = async () => {
    try {
      const [parksResponse, visitsResponse] = await Promise.all([
        fetch('/api/parks'),
        fetch('/api/visits')
      ]);

      if (!parksResponse.ok) throw new Error('Failed to fetch parks');

      const parksData: ParkFromDB[] = await parksResponse.json();

      const visitedParkCodes: Set<string> = new Set();
      const bucketListParkCodes: Set<string> = new Set();
      const visitDatesMap: Record<string, string> = {};
      const journalMap: Record<string, { title: string | null; notes: string | null; photos: string[] | null; visibility: string | null; endDate: string | null }> = {};
      const visitsPerPark: Record<string, VisitEntry[]> = {};

      if (visitsResponse.ok) {
        const visitsData: Array<{
          id: number;
          park_code: string;
          is_bucket_list: boolean;
          visited_date: string | null;
          end_date: string | null;
          title: string | null;
          notes: string | null;
          photos: string[] | null;
          visibility: string | null;
        }> = await visitsResponse.json();

        visitsData.forEach(visit => {
          if (visit.is_bucket_list) {
            bucketListParkCodes.add(visit.park_code);
          } else if (visit.visited_date) {
            visitedParkCodes.add(visit.park_code);
            if (!visitsPerPark[visit.park_code]) visitsPerPark[visit.park_code] = [];
            visitsPerPark[visit.park_code].push({
              id: visit.id,
              visited_date: visit.visited_date,
              end_date: visit.end_date,
              title: visit.title,
              notes: visit.notes,
            });
          }
        });

        // For each park, sort visits newest-first and derive latest date/journal
        for (const [parkCode, parkVisits] of Object.entries(visitsPerPark)) {
          parkVisits.sort((a, b) => new Date(b.visited_date).getTime() - new Date(a.visited_date).getTime());
          const latest = parkVisits[0];
          visitDatesMap[parkCode] = latest.visited_date;
          const latestFull = visitsData.find(v => v.park_code === parkCode && v.id === latest.id);
          if (latestFull) {
            journalMap[parkCode] = {
              title: latestFull.title,
              notes: latestFull.notes,
              photos: latestFull.photos,
              visibility: latestFull.visibility,
              endDate: latestFull.end_date,
            };
          }
        }

        setVisitedParksCount(visitedParkCodes.size);
      } else {
        setVisitedParksCount(0);
      }

      const transformedParks: ParkForMap[] = parksData
        .filter(park => park.latitude && park.longitude)
        .map(park => {
          let status: 'visited' | 'notVisited' | 'bucketList' = 'notVisited';
          if (visitedParkCodes.has(park.park_code)) status = 'visited';
          else if (bucketListParkCodes.has(park.park_code)) status = 'bucketList';
          const journal = journalMap[park.park_code];
          return {
            park_code: park.park_code,
            name: park.name,
            states: park.states,
            position: [parseFloat(park.latitude!), parseFloat(park.longitude!)] as [number, number],
            status,
            description: park.description || undefined,
            visitedDate: visitDatesMap[park.park_code] || null,
            visitedEndDate: journal?.endDate ?? null,
            visits: visitsPerPark[park.park_code] ?? [],
            title: journal?.title ?? null,
            notes: journal?.notes ?? null,
            photos: journal?.photos ?? null,
            visibility: journal?.visibility ?? null,
            image_url: park.image_url,
          };
        });

      setParks(transformedParks);
    } catch (error) {
      console.error('Error fetching parks:', error);
    }
  };

  useEffect(() => {
    void (async () => { await fetchParksAndVisits(); })();
  }, []);

  useEffect(() => {
    fetch('/api/parks/nps-all')
      .then((r) => r.json())
      .then((data: Record<string, NpsSummary>) => setNpsCache(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopImmediatePropagation(); // prevent GlobalSpotlight in DesktopShell from also opening
        setSpotOpen((s) => !s);
      } else if (e.key === 'Escape') {
        setSpotOpen(false);
        // Panel closes itself via its own Escape handler (lightbox-aware)
      }
    };
    // Capture phase so this fires before DesktopShell's bubble-phase handler
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // After parks load: fly to the URL-specified park once (not triggered by clicking dots)
  useEffect(() => {
    if (initialFlyDoneRef.current || parks.length === 0 || !initialParkCodeRef.current) return;
    const park = parks.find((p) => p.park_code === initialParkCodeRef.current);
    if (park) {
      setFlyToTarget({ coords: [...park.position] as [number, number], rightPadding: 376 });
      initialFlyDoneRef.current = true;
    }
  }, [parks]);

  const selectPark = (code: string) => {
    setSelectedParkCode(code);
    window.history.replaceState(null, "", `/map?park=${code}`);
  };

  const deselectPark = () => {
    setSelectedParkCode(null);
    window.history.replaceState(null, "", "/map");
  };

  const handleMarkVisited = (parkCode: string) => {
    setLogVisitDraft({ parkCode });
    setLogVisitEditMode(false);
    setLogVisitOpen(true);
  };

  const handleAddToBucketList = async (parkCode: string) => {
    try {
      const response = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ park_code: parkCode, is_bucket_list: true }),
      });
      if (!response.ok) throw new Error('Failed to add park to bucket list');
      setParks(prev => prev.map(p =>
        p.park_code === parkCode ? { ...p, status: 'bucketList' as const, visitedDate: null } : p
      ));
    } catch (error) {
      console.error('Error adding park to bucket list:', error);
    }
  };

  const handleRemoveFromBucketList = async (parkCode: string) => {
    try {
      const response = await fetch(`/api/visits?park_code=${parkCode}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to remove park from bucket list');
      setParks(prev => prev.map(p =>
        p.park_code === parkCode ? { ...p, status: 'notVisited' as const, visitedDate: null } : p
      ));
    } catch (error) {
      console.error('Error removing park from bucket list:', error);
    }
  };

  const handleEditVisit = (park: ParkForMap) => {
    setLogVisitDraft({
      parkCode: park.park_code,
      dates: {
        start: park.visitedDate ? new Date(park.visitedDate) : null,
        end: park.visitedEndDate ? new Date(park.visitedEndDate) : null,
      },
      title: park.title ?? "",
      notes: park.notes ?? "",
      photos: park.photos ?? [],
      cover: park.photos?.[0] ?? null,
      visibility: (park.visibility
        ? park.visibility.charAt(0).toUpperCase() + park.visibility.slice(1)
        : "Private") as "Private" | "Friends" | "Public",
    });
    setLogVisitEditMode(true);
    setLogVisitOpen(true);
  };

  const bucketListCount = parks.filter(p => p.status === 'bucketList').length;

  const filteredParks = filterStatus === 'all'
    ? parks
    : filterStatus === 'notVisited'
      ? parks.filter(p => p.status === 'notVisited' || p.status === 'bucketList')
      : parks.filter(p => p.status === filterStatus);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isSignedIn) {
    return (
      <DesktopShell fullbleed onOpenSpotlight={() => setSpotOpen(true)}>
        {/* Full-bleed map area with absolute floating panels */}
        <div className="relative h-full w-full" style={{ background: "#E8E2D0" }}>

          {/* SVG map */}
          <USAMap
            className="h-full w-full"
            parks={filteredParks}
            selectedParkCode={selectedParkCode}
            onSelectPark={selectPark}
            onDeselect={deselectPark}
            flyToTarget={flyToTarget}
          />

          {/* Top-left — Filter + counts pill */}
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              zIndex: 20,
              background: "rgba(255,251,241,0.92)",
              backdropFilter: "blur(24px) saturate(160%)",
              WebkitBackdropFilter: "blur(24px) saturate(160%)",
              border: "0.5px solid var(--hairline)",
              borderRadius: 100,
              padding: "6px 8px",
              display: "flex",
              alignItems: "center",
              gap: 2,
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.6px",
              fontWeight: 600,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
          >
            {[
              { key: "all" as FilterStatus,        dot: "var(--ink)",       label: "ALL",     count: parks.length },
              { key: "visited" as FilterStatus,    dot: "var(--visited)",   label: "VISITED", count: visitedParksCount },
              { key: "bucketList" as FilterStatus, dot: "var(--bucket)",    label: "BUCKET",  count: bucketListCount },
              { key: "notVisited" as FilterStatus, dot: "var(--unvisited)", label: "TO GO",   count: parks.filter(p => p.status === "notVisited").length },
            ].map((f, i, arr) => (
              <React.Fragment key={f.key}>
                <button
                  onClick={() => { setFilterStatus(f.key); deselectPark(); }}
                  style={{
                    background: filterStatus === f.key ? "rgba(31,61,46,0.08)" : "transparent",
                    border: 0,
                    cursor: "pointer",
                    borderRadius: 100,
                    padding: "4px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    color: filterStatus === f.key ? "var(--ink)" : "var(--ink-soft)",
                    transition: "background 120ms",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: f.dot, display: "inline-block", flexShrink: 0 }} />
                  <b style={{ color: "var(--ink)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{f.count}</b>
                  {f.label}
                </button>
                {i < arr.length - 1 && (
                  <span style={{ width: 1, height: 12, background: "var(--hairline)", display: "inline-block", flexShrink: 0 }} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Top-center — Spotlight search (pushed below filter pill on mobile) */}
          <MapSpotlight
            parks={parks}
            open={spotOpen}
            topPx={isMobile ? 68 : 16}
            onToggle={() => setSpotOpen((s) => !s)}
            onClose={() => setSpotOpen(false)}
            onPick={(code) => {
              const park = parks.find((p) => p.park_code === code);
              if (park) setFlyToTarget({ coords: [...park.position] as [number, number], rightPadding: 376 });
              selectPark(code);
              setSpotOpen(false);
            }}
          />

          {/* Right floating panel — park detail peek */}
          {selectedPark && (
            <MapRightPanel
              key={selectedPark.park_code}
              park={selectedPark}
              prefetchedNps={npsCache[selectedPark.park_code]}
              onClose={deselectPark}
              onMarkVisited={() => handleMarkVisited(selectedPark.park_code)}
              onAddToBucketList={() => handleAddToBucketList(selectedPark.park_code)}
              onRemoveFromBucketList={() => handleRemoveFromBucketList(selectedPark.park_code)}
              onEditVisit={() => handleEditVisit(selectedPark)}
            />
          )}
        </div>

        <LogVisitModal
          open={logVisitOpen}
          onClose={() => { setLogVisitOpen(false); setLogVisitDraft(undefined); setLogVisitEditMode(false); }}
          onPosted={fetchParksAndVisits}
          initialDraft={logVisitDraft}
          editMode={logVisitEditMode}
        />
      </DesktopShell>
    );
  }
}
