"use client";

import React from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { type FilterStatus } from "@/components/desktop/MapLeftPanel";
import { MapRightPanel } from "@/components/desktop/MapRightPanel";
import { MapSpotlight } from "@/components/desktop/MapSpotlight";
import VisitDateDialog, { type JournalData } from "@/components/VisitDateDialog";
import EditVisitDialog from "@/components/EditVisitDialog";

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
}

interface ParkForMap {
  park_code: string;
  name: string;
  states: string;
  position: [number, number];
  status: 'visited' | 'notVisited' | 'bucketList';
  description?: string;
  visitedDate?: string | null;
  title?: string | null;
  notes?: string | null;
  photos?: string[] | null;
  visibility?: string | null;
}


export default function Home() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();

  const [parks, setParks] = useState<ParkForMap[]>([]);
  const [visitedParksCount, setVisitedParksCount] = useState(0);
  const [showVisitDateDialog, setShowVisitDateDialog] = useState(false);
  const [pendingParkCode, setPendingParkCode] = useState<string | null>(null);
  const [pendingParkName, setPendingParkName] = useState<string>("");
  const [pendingEdit, setPendingEdit] = useState<ParkForMap | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [selectedParkCode, setSelectedParkCode] = useState<string | null>(null);

  // Derive selected park from parks state so it auto-updates after status changes
  const selectedPark = selectedParkCode
    ? parks.find((p) => p.park_code === selectedParkCode) ?? null
    : null;

  useEffect(() => {
    if (!isSignedIn && isLoaded) {
      router.push('/');
    }
  }, [isSignedIn, isLoaded, router]);

  const [spotOpen, setSpotOpen] = useState(false);

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
      const journalMap: Record<string, { title: string | null; notes: string | null; photos: string[] | null; visibility: string | null }> = {};

      if (visitsResponse.ok) {
        const visitsData: Array<{ park_code: string; is_bucket_list: boolean; visited_date: string | null; title: string | null; notes: string | null; photos: string[] | null; visibility: string | null }> = await visitsResponse.json();
        visitsData.forEach(visit => {
          if (visit.is_bucket_list) {
            bucketListParkCodes.add(visit.park_code);
          } else if (visit.visited_date) {
            visitedParkCodes.add(visit.park_code);
            visitDatesMap[visit.park_code] = visit.visited_date;
            journalMap[visit.park_code] = { title: visit.title, notes: visit.notes, photos: visit.photos, visibility: visit.visibility };
          }
        });
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
          return {
            park_code: park.park_code,
            name: park.name,
            states: park.states,
            position: [parseFloat(park.latitude!), parseFloat(park.longitude!)] as [number, number],
            status,
            description: park.description || undefined,
            visitedDate: visitDatesMap[park.park_code] || null,
            ...(journalMap[park.park_code] ?? {}),
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
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSpotOpen((s) => !s);
      } else if (e.key === 'Escape') {
        setSpotOpen(false);
        setSelectedParkCode(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleMarkVisited = (parkCode: string) => {
    const park = parks.find(p => p.park_code === parkCode);
    if (park) {
      setPendingParkCode(parkCode);
      setPendingParkName(park.name);
      setShowVisitDateDialog(true);
    }
  };

  const handleConfirmVisitDate = async (date: Date, journal: JournalData) => {
    if (!pendingParkCode) return;
    const park = parks.find(p => p.park_code === pendingParkCode);
    const wasAlreadyVisited = park?.status === 'visited';
    try {
      const response = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          park_code: pendingParkCode,
          is_bucket_list: false,
          visited_date: date.toISOString(),
          title: journal.title,
          notes: journal.notes,
          photos: journal.photos,
          visibility: journal.visibility,
        }),
      });
      if (!response.ok) throw new Error('Failed to mark park as visited');
      setParks(prev => prev.map(p =>
        p.park_code === pendingParkCode ? { ...p, status: 'visited' as const, visitedDate: date.toISOString() } : p
      ));
      if (!wasAlreadyVisited) setVisitedParksCount(prev => prev + 1);
    } catch (error) {
      console.error('Error marking park as visited:', error);
    } finally {
      setPendingParkCode(null);
      setPendingParkName("");
    }
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

  const handleEditVisit = async (parkCode: string, date: Date, journal: JournalData) => {
    const res = await fetch('/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        park_code: parkCode,
        is_bucket_list: false,
        visited_date: date.toISOString(),
        title: journal.title,
        notes: journal.notes,
        photos: journal.photos,
        visibility: journal.visibility,
      }),
    });
    if (!res.ok) return;
    setParks(prev => prev.map(p =>
      p.park_code === parkCode
        ? { ...p, visitedDate: date.toISOString(), title: journal.title, notes: journal.notes, photos: journal.photos ?? null, visibility: journal.visibility }
        : p
    ));
    setPendingEdit(null);
  };

  const handleMarkNotVisited = async (parkCode: string) => {
    try {
      const response = await fetch(`/api/visits?park_code=${parkCode}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to mark park as unvisited');
      setParks(prev => prev.map(p =>
        p.park_code === parkCode ? { ...p, status: 'notVisited' as const, visitedDate: null } : p
      ));
      setVisitedParksCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking park as unvisited:', error);
    }
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
      <DesktopShell fullbleed onLogVisit={() => handleMarkVisited(parks.find(p => p.status !== "visited")?.park_code ?? "")}>
        {/* Full-bleed map area with absolute floating panels */}
        <div className="relative h-full w-full" style={{ background: "#E8E2D0" }}>

          {/* SVG map */}
          <USAMap
            className="h-full w-full"
            parks={filteredParks}
            selectedParkCode={selectedParkCode}
            onSelectPark={setSelectedParkCode}
            onDeselect={() => setSelectedParkCode(null)}
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
                  onClick={() => { setFilterStatus(f.key); setSelectedParkCode(null); }}
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

          {/* Top-center — Spotlight search */}
          <MapSpotlight
            parks={parks}
            open={spotOpen}
            onToggle={() => setSpotOpen((s) => !s)}
            onClose={() => setSpotOpen(false)}
            onPick={(code) => { setSelectedParkCode(code); setSpotOpen(false); }}
          />

          {/* Right floating panel — park detail peek */}
          {selectedPark && (
            <MapRightPanel
              park={selectedPark}
              onClose={() => setSelectedParkCode(null)}
              onMarkVisited={() => handleMarkVisited(selectedPark.park_code)}
              onAddToBucketList={() => handleAddToBucketList(selectedPark.park_code)}
              onRemoveFromBucketList={() => handleRemoveFromBucketList(selectedPark.park_code)}
              onEditVisit={() => setPendingEdit(selectedPark)}
            />
          )}
        </div>

        <VisitDateDialog
          open={showVisitDateDialog}
          onOpenChange={setShowVisitDateDialog}
          parkName={pendingParkName}
          onConfirm={handleConfirmVisitDate}
        />
        {pendingEdit && (
          <EditVisitDialog
            open={!!pendingEdit}
            onOpenChange={(open) => { if (!open) setPendingEdit(null); }}
            parkName={pendingEdit.name}
            existing={{
              visitedDate: pendingEdit.visitedDate ?? new Date().toISOString(),
              title: pendingEdit.title,
              notes: pendingEdit.notes,
              photos: pendingEdit.photos,
              visibility: pendingEdit.visibility,
            }}
            onSave={(date, journal) => handleEditVisit(pendingEdit.park_code, date, journal)}
            onDelete={async () => {
              await handleMarkNotVisited(pendingEdit.park_code);
              setPendingEdit(null);
            }}
          />
        )}
      </DesktopShell>
    );
  }
}
