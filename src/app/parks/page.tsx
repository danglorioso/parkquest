"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Header from "@/components/Header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, MapPin, ChevronLeft, ChevronRight, X, SlidersHorizontal } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Park {
  park_code: string;
  name: string;
  states: string;
  description: string | null;
}

interface FeaturedPark {
  park_code: string;
  name: string;
  images: { url: string; title: string; alt: string }[];
}

interface Activity {
  id: string;
  name: string;
}

// ─── State name map ───────────────────────────────────────────────────────────

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "Washington D.C.",
  AS: "American Samoa", GU: "Guam", MP: "Northern Mariana Islands",
  PR: "Puerto Rico", VI: "U.S. Virgin Islands",
};

// ─── Carousel ────────────────────────────────────────────────────────────────

function HeroCarousel({ parks }: { parks: FeaturedPark[] }) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIndex(i => (i + 1) % parks.length), 5000);
  }, [parks.length]);

  useEffect(() => {
    if (parks.length === 0) return;
    resetTimer();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [index, parks.length, resetTimer]);

  const go = (dir: 1 | -1) => setIndex(i => (i + dir + parks.length) % parks.length);

  if (parks.length === 0) return (
    <div className="w-full h-72 sm:h-96 bg-gradient-to-br from-emerald-900 to-emerald-700 animate-pulse" />
  );

  const current = parks[index];
  const img = current.images[0];

  return (
    <div className="relative w-full h-72 sm:h-[420px] overflow-hidden bg-gray-900 select-none">
      {/* Image */}
      <img
        key={current.park_code}
        src={img.url}
        alt={img.alt || current.name}
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* Park info */}
      <div className="absolute bottom-0 left-0 right-0 px-6 pb-8 sm:pb-10">
        <Link href={`/parks/${current.park_code}`} className="group inline-block">
          <h2 className="text-white text-xl sm:text-3xl font-bold drop-shadow-lg group-hover:underline leading-tight">
            {current.name}
          </h2>
          <p className="text-white/70 text-sm mt-1 group-hover:text-white/90 transition-colors">
            Explore this park →
          </p>
        </Link>
      </div>

      {/* Arrows */}
      <button
        onClick={() => go(-1)}
        className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors cursor-pointer"
        aria-label="Previous"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => go(1)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors cursor-pointer"
        aria-label="Next"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {parks.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all cursor-pointer ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Park card ────────────────────────────────────────────────────────────────

function ParkCard({ park, image }: { park: Park; image?: string }) {
  const stateLabels = park.states.split(",").map(s => STATE_NAMES[s.trim()] ?? s.trim());
  return (
    <Link
      href={`/parks/${park.park_code}`}
      className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
    >
      {image ? (
        <div className="aspect-[16/9] overflow-hidden bg-gray-100">
          <img src={image} alt={park.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        </div>
      ) : (
        <div className="aspect-[16/9] bg-gradient-to-br from-emerald-800 to-emerald-600 flex items-center justify-center">
          <MapPin className="w-8 h-8 text-white/50" />
        </div>
      )}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="text-sm font-semibold text-gray-900 group-hover:text-emerald-700 transition-colors leading-snug line-clamp-2">
          {park.name}
        </h3>
        <div className="flex flex-wrap gap-1">
          {stateLabels.slice(0, 3).map(s => (
            <span key={s} className="text-[10px] font-medium bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5">{s}</span>
          ))}
          {stateLabels.length > 3 && (
            <span className="text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">+{stateLabels.length - 3}</span>
          )}
        </div>
        {park.description && (
          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{park.description}</p>
        )}
      </div>
    </Link>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function ExplorePageInner() {
  const { isSignedIn, isLoaded } = useUser();
  const searchParams = useSearchParams();

  const [parks, setParks] = useState<Park[]>([]);
  const [featured, setFeatured] = useState<FeaturedPark[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [parksLoading, setParksLoading] = useState(true);
  const [carouselLoading, setCarouselLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [activityFilter, setActivityFilter] = useState<Activity | null>(null);
  // fetchedFor tracks which activity ID the codes were fetched for,
  // letting us derive loading state without synchronous setState in effects
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const [fetchedActivityCodes, setFetchedActivityCodes] = useState<Set<string> | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const activityLoading = !!activityFilter && fetchedFor !== activityFilter.id;
  const activityParkCodes = activityFilter && fetchedFor === activityFilter.id ? fetchedActivityCodes : null;

  const initialActivityId = searchParams.get('activityId');
  const appliedInitialFilter = useRef(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/parks").then(r => r.json()),
      fetch("/api/parks/activities").then(r => r.json()),
    ]).then(([parksData, activitiesData]: [Park[], Activity[]]) => {
      setParks(parksData);
      setActivities(activitiesData);
    }).finally(() => setParksLoading(false));

    fetch("/api/parks/featured")
      .then(r => r.json())
      .then((data: FeaturedPark[]) => setFeatured(data))
      .finally(() => setCarouselLoading(false));
  }, []);

  // Apply URL activity filter once activities have loaded.
  // queueMicrotask keeps setState out of the synchronous effect body.
  useEffect(() => {
    if (!initialActivityId || activities.length === 0 || appliedInitialFilter.current) return;
    const match = activities.find(a => a.id === initialActivityId);
    if (match) {
      appliedInitialFilter.current = true;
      queueMicrotask(() => {
        setActivityFilter(match);
        setShowFilters(true);
      });
    }
  }, [activities, initialActivityId]);

  // Load park codes for selected activity — all setState calls happen in async callbacks
  useEffect(() => {
    if (!activityFilter) return;
    fetch(`/api/parks/activities?id=${activityFilter.id}`)
      .then(r => r.json())
      .then((codes: string[]) => {
        setFetchedActivityCodes(new Set(codes));
        setFetchedFor(activityFilter.id);
      })
      .catch(() => setFetchedFor(activityFilter.id));
  }, [activityFilter]);

  // Carousel parks — only DB parks, randomly sampled once on load
  const [carouselParks, setCarouselParks] = useState<FeaturedPark[]>([]);
  const carouselSeeded = useRef(false);
  useEffect(() => {
    if (parks.length === 0 || featured.length === 0 || carouselSeeded.current) return;
    carouselSeeded.current = true;
    const dbCodes = new Set(parks.map(p => p.park_code));
    const REVERSE_ALIASES: Record<string, string[]> = { seki: ['sequ', 'king'] };
    const inDb = featured.filter(f =>
      dbCodes.has(f.park_code) || (REVERSE_ALIASES[f.park_code] ?? []).some(c => dbCodes.has(c))
    );
    Promise.resolve([...inDb].sort(() => Math.random() - 0.5).slice(0, 12))
      .then(setCarouselParks);
  }, [parks, featured]);

  // Build image map from featured (NPS codes → image URL)
  const imageMap = new Map(featured.map(f => [f.park_code, f.images[0]?.url]));
  // Alias DB codes that map to a combined NPS entry
  const IMAGE_ALIASES: Record<string, string> = { sequ: 'seki', king: 'seki' };
  Object.entries(IMAGE_ALIASES).forEach(([dbCode, npsCode]) => {
    if (!imageMap.has(dbCode) && imageMap.has(npsCode)) {
      imageMap.set(dbCode, imageMap.get(npsCode)!);
    }
  });

  // Extract unique states
  const allStates = [...new Set(parks.flatMap(p => p.states.split(",").map(s => s.trim())))].sort();

  // Filter parks
  const filtered = parks
    .filter(p => {
      if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
      if (stateFilter && !p.states.split(",").map(s => s.trim()).includes(stateFilter)) return false;
      if (activityParkCodes && !activityParkCodes.has(p.park_code)) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const hasFilters = !!stateFilter || !!activityFilter || !!query;

  const Nav = isLoaded && isSignedIn ? <NavBar /> : <Header />;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {Nav}

      {/* Hero carousel */}
      {carouselLoading ? (
        <div className="w-full h-72 sm:h-[420px] bg-gray-200 animate-pulse" />
      ) : (
        <HeroCarousel parks={carouselParks} />
      )}

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Explore National Parks</h1>
          <p className="text-sm text-gray-500 mt-1">
            {parksLoading ? "Loading…" : `${parks.length} parks across the United States and territories`}
          </p>
        </div>

        {/* Search + filters */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4 pointer-events-none" />
            <Input
              placeholder="Search parks…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
              showFilters || stateFilter || activityFilter
                ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {(stateFilter || activityFilter) && (
              <span className="bg-emerald-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {(stateFilter ? 1 : 0) + (activityFilter ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-wrap gap-4 items-end">
            {/* State */}
            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">State / Territory</label>
              <select
                value={stateFilter}
                onChange={e => setStateFilter(e.target.value)}
                className="border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer"
              >
                <option value="">All states</option>
                {allStates.map(code => (
                  <option key={code} value={code}>{STATE_NAMES[code] ?? code} ({code})</option>
                ))}
              </select>
            </div>

            {/* Activity */}
            <div className="flex flex-col gap-1.5 min-w-[200px]">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Activity</label>
              <select
                value={activityFilter?.id ?? ""}
                onChange={e => {
                  const activity = activities.find(a => a.id === e.target.value) ?? null;
                  setActivityFilter(activity);
                }}
                className="border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer"
                disabled={activities.length === 0}
              >
                <option value="">All activities</option>
                {activities.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            {/* Clear */}
            {hasFilters && (
              <div>
                <button
                  onClick={() => { setStateFilter(""); setActivityFilter(null); setQuery(""); }}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition-colors cursor-pointer px-2 py-2"
                >
                  <X className="w-3.5 h-3.5" /> Clear all
                </button>
              </div>
            )}
          </div>
        )}

        {/* Active filter pills */}
        {(stateFilter || activityFilter) && (
          <div className="flex gap-2 flex-wrap mb-4">
            {stateFilter && (
              <span className="flex items-center gap-1.5 text-xs bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 font-medium">
                {STATE_NAMES[stateFilter] ?? stateFilter}
                <button onClick={() => setStateFilter("")} className="cursor-pointer hover:text-emerald-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {activityFilter && (
              <span className="flex items-center gap-1.5 text-xs bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 font-medium">
                {activityFilter.name}
                <button onClick={() => setActivityFilter(null)} className="cursor-pointer hover:text-emerald-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}

        {/* Results count */}
        {!parksLoading && (
          <p className="text-xs text-gray-400 mb-4">
            {activityLoading ? "Filtering…" : `${filtered.length} park${filtered.length !== 1 ? "s" : ""} ${hasFilters ? "match your filters" : "total"}`}
          </p>
        )}

        {/* Grid */}
        {parksLoading || activityLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <Skeleton className="aspect-[16/9] w-full" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-600">No parks match your filters</p>
            <button onClick={() => { setStateFilter(""); setActivityFilter(null); setQuery(""); }} className="text-sm text-emerald-600 hover:underline mt-1 cursor-pointer">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(park => (
              <ParkCard key={park.park_code} park={park} image={imageMap.get(park.park_code)} />
            ))}
          </div>
        )}

        {/* Data Attribution Disclaimer */}
        <div className="border-t border-gray-200 mt-8 pt-6">
          <p className="text-xs text-gray-400 leading-relaxed">
            Park information is sourced directly from the{" "}
            <a
              href="https://www.nps.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-600"
            >
              National Park Service (NPS)
            </a>
            . ParkQuest does not guarantee the accuracy, completeness, or timeliness of any information displayed. Always verify details with official sources before your visit.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense>
      <ExplorePageInner />
    </Suspense>
  );
}
