"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Header from "@/components/Header";
import VisitDateDialog, { type JournalData } from "@/components/VisitDateDialog";
import EditVisitDialog from "@/components/EditVisitDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  Bookmark,
  Pencil,
  Trash2,
  MapPin,
  Phone,
  Mail,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  CloudSun,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudDrizzle,
  CloudLightning,
  CloudFog,
  Wind,
  Droplets,
  Sun,
  Moon,
  Snowflake,
  Thermometer,
  Tag,
  Mountain,
  CalendarDays,
  X,
  Expand,
} from "lucide-react";

/* ─── NPS API Types ──────────────────────────────────────────────────────── */

interface NPSImage {
  url: string;
  title: string;
  altText: string;
  caption: string;
  credit: string;
}

interface NPSActivity {
  id: string;
  name: string;
}

interface NPSTopic {
  id: string;
  name: string;
}

interface NPSAddress {
  type: string;
  line1: string;
  city: string;
  stateCode: string;
  postalCode: string;
}

interface NPSContact {
  phoneNumbers: Array<{ phoneNumber: string; type: string; description: string }>;
  emailAddresses: Array<{ emailAddress: string; description: string }>;
}

interface NPSFee {
  cost: string;
  title: string;
  description: string;
}

interface NPSHours {
  name: string;
  description: string;
  standardHours: Record<string, string>;
  exceptions: Array<{
    name: string;
    startDate: string;
    endDate: string;
    exceptionHours: Record<string, string>;
  }>;
}

interface NPSPark {
  id: string;
  url: string;
  fullName: string;
  parkCode: string;
  description: string;
  latitude: string;
  longitude: string;
  activities: NPSActivity[];
  topics: NPSTopic[];
  states: string;
  contacts: NPSContact;
  entranceFees: NPSFee[];
  entrancePasses: NPSFee[];
  directionsInfo: string;
  directionsUrl: string;
  operatingHours: NPSHours[];
  addresses: NPSAddress[];
  images: NPSImage[];
  weatherInfo: string;
  name: string;
  designation: string;
}

type VisitStatus = "visited" | "bucketList" | "notVisited";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/* ─── Weather icon helper ────────────────────────────────────────────────── */

// Parse the NWS icon URL (e.g. ".../day/tsra,80" or ".../night/few") to pick a lucide icon.
function getWeatherIcon(iconUrl: string, isDaytime: boolean, size: "sm" | "lg" = "lg") {
  const cls = size === "lg" ? "w-8 h-8" : "w-6 h-6";
  // Extract the condition segment after "day/" or "night/"
  const match = iconUrl.match(/\/(day|night)\/([^?/,]+)/);
  const code = match?.[2] ?? "";

  if (code.startsWith("tsra") || code.includes("lightning")) {
    return <CloudLightning className={`${cls} text-yellow-500`} />;
  }
  if (code === "tornado") {
    return <Wind className={`${cls} text-purple-500`} />;
  }
  if (code === "rain" || code === "fzra" || code.includes("sleet") || code === "rain_fzra") {
    return <CloudRain className={`${cls} text-blue-500`} />;
  }
  if (code === "rain_showers" || code === "rain_showers_hi") {
    return <CloudDrizzle className={`${cls} text-blue-400`} />;
  }
  if (code.includes("snow") || code === "blizzard") {
    return <CloudSnow className={`${cls} text-sky-400`} />;
  }
  if (code === "cold") {
    return <Snowflake className={`${cls} text-sky-400`} />;
  }
  if (code === "hot") {
    return <Thermometer className={`${cls} text-orange-500`} />;
  }
  if (code === "fog" || code === "haze" || code === "smoke" || code === "dust") {
    return <CloudFog className={`${cls} text-gray-400`} />;
  }
  if (code.startsWith("wind_")) {
    return <Wind className={`${cls} text-gray-400`} />;
  }
  if (code === "ovc" || code === "bkn") {
    return <CloudSun className={`${cls} text-gray-400`} />;
  }
  if (code === "sct" || code === "few") {
    return isDaytime
      ? <CloudSun className={`${cls} text-amber-400`} />
      : <CloudMoon className={`${cls} text-indigo-300`} />;
  }
  // skc = clear / default
  return isDaytime
    ? <Sun className={`${cls} text-amber-400`} />
    : <Moon className={`${cls} text-indigo-300`} />;
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ParkPage({
  params,
}: {
  params: Promise<{ parkCode: string }>;
}) {
  const { parkCode } = use(params);
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();

  const [park, setPark] = useState<NPSPark | null>(null);
  const [parkLoading, setParkLoading] = useState(true);
  const [parkError, setParkError] = useState(false);

  const [visitStatus, setVisitStatus] = useState<VisitStatus>("notVisited");
  const [visitedDate, setVisitedDate] = useState<string | null>(null);
  const [visitLoading, setVisitLoading] = useState(true);
  const [totalParksCount, setTotalParksCount] = useState(0);
  const [visitedParksCount, setVisitedParksCount] = useState(0);

  const [showVisitDateDialog, setShowVisitDateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [visitJournal, setVisitJournal] = useState<{ title: string | null; notes: string | null; photos: string[] | null; visibility: string | null }>({ title: null, notes: null, photos: null, visibility: null });
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselDisplayedIndex, setCarouselDisplayedIndex] = useState(0);
  const [carouselImgLoading, setCarouselImgLoading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showAllActivities, setShowAllActivities] = useState(true);
  const [showAllTopics, setShowAllTopics] = useState(true);

  interface WeatherPeriod {
    name: string;
    temp: number;
    tempUnit: string;
    shortForecast: string;
    detailedForecast: string;
    icon: string;
    isDaytime: boolean;
    windSpeed: string;
    windDirection: string;
    precipChance: number | null;
  }
  const [weather, setWeather] = useState<WeatherPeriod[] | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherUnavailable, setWeatherUnavailable] = useState(false);

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);

  const lightboxPrev = useCallback(() => {
    if (!park) return;
    setLightboxIndex((i) => (i === null ? 0 : (i - 1 + park.images.length) % park.images.length));
  }, [park]);

  const lightboxNext = useCallback(() => {
    if (!park) return;
    setLightboxIndex((i) => (i === null ? 0 : (i + 1) % park.images.length));
  }, [park]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") lightboxPrev();
      if (e.key === "ArrowRight") lightboxNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, lightboxPrev, lightboxNext]);

  useEffect(() => {
    fetchPark();
  }, [parkCode]);

  useEffect(() => {
    if (!park?.latitude || !park?.longitude) return;
    setWeatherLoading(true);
    setWeatherUnavailable(false);
    fetch(`/api/weather?lat=${park.latitude}&lon=${park.longitude}`)
      .then(r => {
        if (r.status === 404) { setWeatherUnavailable(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then(data => { if (data) setWeather(data); })
      .catch(() => {})
      .finally(() => setWeatherLoading(false));
  }, [park?.latitude, park?.longitude]);

  useEffect(() => {
    if (isSignedIn) {
      fetchVisitStatus();
    } else {
      setVisitLoading(false);
    }
  }, [isSignedIn, parkCode]);

  const fetchPark = async () => {
    try {
      const res = await fetch(`/api/parks/${parkCode}`);
      if (!res.ok) throw new Error("Not found");
      const data: NPSPark = await res.json();
      setPark(data);
    } catch {
      setParkError(true);
    } finally {
      setParkLoading(false);
    }
  };

  const fetchVisitStatus = async () => {
    try {
      const [visitsRes, parksRes] = await Promise.all([
        fetch("/api/visits"),
        fetch("/api/parks"),
      ]);
      if (visitsRes.ok) {
        const visits: Array<{
          park_code: string;
          is_bucket_list: boolean;
          visited_date: string | null;
          title: string | null;
          notes: string | null;
          photos: string[] | null;
          visibility: string | null;
        }> = await visitsRes.json();
        const match = visits.find((v) => v.park_code === parkCode);
        if (match) {
          if (match.is_bucket_list) {
            setVisitStatus("bucketList");
          } else {
            setVisitStatus("visited");
            setVisitedDate(match.visited_date);
            setVisitJournal({ title: match.title, notes: match.notes, photos: match.photos, visibility: match.visibility });
          }
        }
        setVisitedParksCount(
          visits.filter((v) => !v.is_bucket_list && v.visited_date).length
        );
      }
      if (parksRes.ok) {
        const allParks: unknown[] = await parksRes.json();
        setTotalParksCount(allParks.length);
      }
    } finally {
      setVisitLoading(false);
    }
  };

  const handleMarkVisited = () => setShowVisitDateDialog(true);

  const handleConfirmVisitDate = async (date: Date, journal: JournalData) => {
    const wasVisited = visitStatus === "visited";
    try {
      const res = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      if (!res.ok) throw new Error("Failed");
      setVisitStatus("visited");
      setVisitedDate(date.toISOString());
      setVisitJournal({ title: journal.title ?? null, notes: journal.notes ?? null, photos: journal.photos ?? null, visibility: journal.visibility });
      if (!wasVisited) setVisitedParksCount((p) => p + 1);
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditVisit = async (date: Date, journal: JournalData) => {
    try {
      const res = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      if (!res.ok) throw new Error("Failed");
      setVisitedDate(date.toISOString());
      setVisitJournal({ title: journal.title ?? null, notes: journal.notes ?? null, photos: journal.photos ?? null, visibility: journal.visibility });
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddToBucketList = async () => {
    try {
      const res = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ park_code: parkCode, is_bucket_list: true }),
      });
      if (!res.ok) throw new Error("Failed");
      setVisitStatus("bucketList");
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemove = async () => {
    try {
      const res = await fetch(`/api/visits?park_code=${parkCode}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      if (visitStatus === "visited") setVisitedParksCount((p) => Math.max(0, p - 1));
      setVisitStatus("notVisited");
      setVisitedDate(null);
    } catch (e) {
      console.error(e);
    }
  };

  /* ─── Render ─────────────────────────────────────────────────────────── */

  if (parkLoading) return <LoadingSkeleton />;
  if (parkError || !park) return <NotFound />;

  const heroImage = park.images?.[0];
  const physicalAddress = park.addresses?.find((a) => a.type === "Physical") ?? park.addresses?.[0];
  const phone = park.contacts?.phoneNumbers?.find((p) => p.type === "Voice") ?? park.contacts?.phoneNumbers?.[0];
  const email = park.contacts?.emailAddresses?.[0];
  const stateNames = park.states
    ? park.states.split(",").map((s) => s.trim()).join(", ")
    : "";

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {isLoaded && isSignedIn ? (
        <NavBar />
      ) : (
        <Header />
      )}

      {/* Hero */}
      <div className="relative w-full h-72 sm:h-96 bg-gray-900 overflow-hidden">
        {heroImage && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImage.url}
              alt={heroImage.altText}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${heroLoaded ? "opacity-60" : "opacity-0"}`}
              onLoad={() => setHeroLoaded(true)}
            />
            {!heroLoaded && (
              <div className="absolute inset-0 bg-gray-800 animate-pulse" />
            )}
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent" />

        {/* Back button */}
        <div className="absolute top-4 left-4">
          <button
            onClick={() => window.history.length > 1 ? router.back() : router.push('/map')}
            className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm transition-colors cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-white/15"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        </div>

        {/* Park name */}
        <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-8 pb-6">
          <div className="max-w-5xl mx-auto">
            <p className="text-emerald-400 text-sm font-medium uppercase tracking-wider mb-1">
              {park.designation}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
              {park.fullName}
            </h1>
            {stateNames && (
              <div className="flex items-center gap-1.5 mt-2 text-white/70 text-sm">
                <MapPin className="h-3.5 w-3.5" />
                {stateNames}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ── Main Column ── */}
        <div className="lg:col-span-2 space-y-8">

          {/* Description */}
          <Section title="About" icon={<Mountain className="h-4 w-4" />}>
            <p className="text-gray-700 leading-relaxed">{park.description}</p>
            {park.url && (
              <a
                href={park.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Official NPS page <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </Section>

          {/* Photo Carousel */}
          {park.images?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Main image */}
              <div className="relative aspect-video bg-gray-900 group cursor-pointer" onClick={() => openLightbox(carouselIndex)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={carouselIndex}
                  src={park.images[carouselIndex].url}
                  alt={park.images[carouselIndex].altText}
                  className="w-full h-full object-cover"
                  onLoad={() => { setCarouselDisplayedIndex(carouselIndex); setCarouselImgLoading(false); }}
                />
                {carouselImgLoading && (
                  <div className="absolute inset-0 bg-gray-800 animate-pulse" />
                )}
                {/* Expand button in corner */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors">
                    <Expand className="h-4 w-4 text-white" />
                  </div>
                </div>

                {/* Prev arrow */}
                {park.images.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setCarouselImgLoading(true); setCarouselIndex((i) => (i - 1 + park.images.length) % park.images.length); }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 bg-black/40 hover:bg-black/70 text-white rounded-full transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="Previous photo"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setCarouselImgLoading(true); setCarouselIndex((i) => (i + 1) % park.images.length); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-black/40 hover:bg-black/70 text-white rounded-full transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="Next photo"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}

                {/* Counter */}
                {park.images.length > 1 && (
                  <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                    {carouselIndex + 1} / {park.images.length}
                  </div>
                )}
              </div>

              {/* Caption */}
              {(park.images[carouselDisplayedIndex].title || park.images[carouselDisplayedIndex].caption) && (
                <div className="px-4 py-3 border-t border-gray-100">
                  {park.images[carouselDisplayedIndex].title && (
                    <p className="text-sm font-medium text-gray-800">{park.images[carouselDisplayedIndex].title}</p>
                  )}
                  {park.images[carouselDisplayedIndex].caption && (
                    <p className="text-xs text-gray-400 mt-0.5">{park.images[carouselDisplayedIndex].caption}</p>
                  )}
                </div>
              )}

              {/* Dot indicators */}
              {park.images.length > 1 && (
                <div className="flex justify-center gap-1.5 py-3 border-t border-gray-100">
                  {park.images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { setCarouselImgLoading(true); setCarouselIndex(i); }}
                      className={`rounded-full transition-all ${
                        i === carouselDisplayedIndex
                          ? "w-4 h-2 bg-emerald-500"
                          : "w-2 h-2 bg-gray-300 hover:bg-gray-400"
                      }`}
                      aria-label={`Go to photo ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Activities */}
          {park.activities?.length > 0 && (
            <Section title="Activities" icon={<Tag className="h-4 w-4" />}>
              <div className="flex flex-wrap gap-2">
                {(showAllActivities ? park.activities : park.activities.slice(0, 8)).map((a) => (
                  <Link
                    key={a.id}
                    href={`/parks?activityId=${a.id}`}
                    className="px-3 py-1 bg-emerald-50 text-emerald-700 text-sm rounded-full border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    {a.name}
                  </Link>
                ))}
              </div>
              {park.activities.length > 8 && (
                <button
                  onClick={() => setShowAllActivities((v) => !v)}
                  className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  {showAllActivities ? "Show less" : `Show ${park.activities.length - 8} more`}
                </button>
              )}
            </Section>
          )}

          {/* Weather Forecast */}
          {(weatherLoading || weather || park.weatherInfo) && !weatherUnavailable && (
            <Section title="Weather Forecast" icon={<CloudSun className="h-4 w-4" />}>
              {weatherLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <Skeleton className="h-3 w-16 rounded" />
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-4 w-10 rounded" />
                      <Skeleton className="h-3 w-full rounded" />
                    </div>
                  ))}
                </div>
              ) : weather && weather.length > 0 ? (
                <div className="space-y-4">
                  {/* Day/night forecast cards — show daytime periods first */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {weather.filter(p => p.isDaytime).map((period) => (
                      <div key={period.name} className="bg-sky-50 border border-sky-100 rounded-xl p-3 flex flex-col gap-1.5">
                        <p className="text-xs font-semibold text-sky-800">{period.name}</p>
                        {getWeatherIcon(period.icon, period.isDaytime, "lg")}
                        <p className="text-lg font-bold text-gray-900">
                          {period.temp}°{period.tempUnit}
                        </p>
                        <p className="text-xs text-gray-600 leading-snug">{period.shortForecast}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
                            <Wind className="w-3 h-3" />
                            {period.windSpeed} {period.windDirection}
                          </span>
                          {period.precipChance !== null && (
                            <span className="flex items-center gap-0.5 text-[10px] text-sky-600">
                              <Droplets className="w-3 h-3" />
                              {period.precipChance}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Overnight lows row */}
                  {weather.filter(p => !p.isDaytime).length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {weather.filter(p => !p.isDaytime).map((period) => (
                        <div key={period.name} className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col gap-1.5">
                          <p className="text-xs font-semibold text-gray-500">{period.name}</p>
                          <div className="opacity-70">{getWeatherIcon(period.icon, period.isDaytime, "sm")}</div>
                          <p className="text-base font-bold text-gray-700">
                            {period.temp}°{period.tempUnit}
                          </p>
                          <p className="text-xs text-gray-500 leading-snug">{period.shortForecast}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400">Forecast from the <a href="https://www.weather.gov" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">National Weather Service</a></p>
                </div>
              ) : park.weatherInfo ? (
                <p className="text-gray-700 leading-relaxed">{park.weatherInfo}</p>
              ) : null}
            </Section>
          )}

          {/* Directions */}
          {park.directionsInfo && (
            <Section title="Getting There" icon={<MapPin className="h-4 w-4" />}>
              <p className="text-gray-700 leading-relaxed">{park.directionsInfo}</p>
              {park.directionsUrl && (
                <a
                  href={park.directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  Get directions <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </Section>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-5">

          {/* Visit Status Card */}
          {isLoaded && !isSignedIn && (
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5 space-y-3 text-center">
              <Mountain className="h-8 w-8 text-emerald-400 mx-auto" />
              <p className="font-semibold text-gray-900 text-sm">Track your visits</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Create a free account to log your visit, add this park to your bucket list, and track your progress across all US national parks.
              </p>
              <Link href="/sign-up">
                <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                  Get started free
                </Button>
              </Link>
              <Link href="/sign-in">
                <Button size="sm" variant="outline" className="w-full text-xs mt-1">
                  Sign in
                </Button>
              </Link>
            </div>
          )}
          {isSignedIn && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
              <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
                Your Status
              </h3>

              {visitLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-9 w-full rounded-lg" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                </div>
              ) : visitStatus === "visited" ? (
                <>
                  <div className="flex items-center gap-2 text-emerald-600 font-medium text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    Visited
                  </div>
                  {visitedDate && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {new Date(visitedDate).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowEditDialog(true)}
                    className="w-full text-xs"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit Visit
                  </Button>
                </>
              ) : visitStatus === "bucketList" ? (
                <>
                  <div className="flex items-center gap-2 text-amber-500 font-medium text-sm">
                    <Bookmark className="h-4 w-4" />
                    On Bucket List
                  </div>
                  <Button
                    size="sm"
                    onClick={handleMarkVisited}
                    className="w-full text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Mark as Visited
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRemove}
                    className="w-full text-xs text-red-500 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Remove from List
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    onClick={handleMarkVisited}
                    className="w-full text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Mark as Visited
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddToBucketList}
                    className="w-full text-xs border-amber-300 text-amber-600 hover:bg-amber-50"
                  >
                    <Bookmark className="h-3.5 w-3.5 mr-1.5" />
                    Add to Bucket List
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Entrance Fees */}
          {park.entranceFees?.length > 0 && (
            <SideCard title="Entrance Fees" icon={<DollarSign className="h-4 w-4" />}>
              <div className="space-y-3">
                {park.entranceFees.map((fee, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-sm font-medium text-gray-800">{fee.title}</span>
                      <span className="text-sm font-bold text-emerald-600 shrink-0">
                        ${parseFloat(fee.cost).toFixed(0)}
                      </span>
                    </div>
                    {fee.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{fee.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </SideCard>
          )}

          {/* Operating Hours */}
          {park.operatingHours?.length > 0 && (
            <SideCard title="Hours" icon={<Clock className="h-4 w-4" />}>
              <div className="space-y-1">
                {DAYS.map((day) => {
                  const hours = park.operatingHours[0]?.standardHours?.[day];
                  if (!hours) return null;
                  return (
                    <div key={day} className="flex justify-between text-xs">
                      <span className="capitalize text-gray-500">{day.slice(0, 3)}</span>
                      <span className="text-gray-800 font-medium">{hours}</span>
                    </div>
                  );
                })}
              </div>
              {park.operatingHours[0]?.description && (
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                  {park.operatingHours[0].description}
                </p>
              )}
            </SideCard>
          )}

          {/* Topics */}
          {park.topics?.length > 0 && (
            <SideCard title="Topics" icon={<Tag className="h-4 w-4" />}>
              <div className="flex flex-wrap gap-1.5">
                {(showAllTopics ? park.topics : park.topics.slice(0, 6)).map((t) => (
                  <span
                    key={t.id}
                    className="px-2.5 py-0.5 bg-sky-50 text-sky-700 text-xs rounded-full border border-sky-200"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
              {park.topics.length > 6 && (
                <button
                  onClick={() => setShowAllTopics((v) => !v)}
                  className="mt-2 text-xs text-sky-600 hover:text-sky-700 font-medium"
                >
                  {showAllTopics ? "Show less" : `Show ${park.topics.length - 6} more`}
                </button>
              )}
            </SideCard>
          )}

          {/* Contact */}
          {(phone || email || physicalAddress) && (
            <SideCard title="Contact" icon={<Phone className="h-4 w-4" />}>
              <div className="space-y-2">
                {physicalAddress && (
                  <div className="flex gap-2 text-xs text-gray-600">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400 mt-0.5" />
                    <span>
                      {physicalAddress.line1}, {physicalAddress.city},{" "}
                      {physicalAddress.stateCode} {physicalAddress.postalCode}
                    </span>
                  </div>
                )}
                {phone && (
                  <div className="flex gap-2 text-xs text-gray-600">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <a href={`tel:${phone.phoneNumber}`} className="hover:text-emerald-600 transition-colors">
                      {phone.phoneNumber}
                    </a>
                  </div>
                )}
                {email && (
                  <div className="flex gap-2 text-xs text-gray-600 break-all">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <a href={`mailto:${email.emailAddress}`} className="hover:text-emerald-600 transition-colors">
                      {email.emailAddress}
                    </a>
                  </div>
                )}
              </div>
            </SideCard>
          )}
        </div>
      </div>


      {/* Data Attribution Disclaimer */}
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-8 pb-8">
        <div className="border-t border-gray-200 pt-6">
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
            . Weather forecasts are provided by the{" "}
            <a
              href="https://www.weather.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-600"
            >
              National Weather Service (NWS)
            </a>
            . ParkQuest does not guarantee the accuracy, completeness, or timeliness of any information displayed on this page. Always verify details with official sources before your visit.
          </p>
        </div>
      </div>

      <VisitDateDialog
        open={showVisitDateDialog}
        onOpenChange={setShowVisitDateDialog}
        parkName={park.fullName}
        onConfirm={handleConfirmVisitDate}
      />
      <EditVisitDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        parkName={park.fullName}
        existing={{
          visitedDate: visitedDate ?? new Date().toISOString(),
          title: visitJournal.title,
          notes: visitJournal.notes,
          photos: visitJournal.photos,
          visibility: visitJournal.visibility,
        }}
        onSave={(date, journal) => handleEditVisit(date, journal)}
        onDelete={handleRemove}
      />

      {/* Lightbox */}
      {lightboxIndex !== null && park.images?.[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close */}
          <button
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors"
            onClick={closeLightbox}
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {lightboxIndex + 1} / {park.images.length}
          </div>

          {/* Prev */}
          {park.images.length > 1 && (
            <button
              className="absolute left-3 sm:left-6 p-2 text-white/70 hover:text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); lightboxPrev(); }}
              aria-label="Previous image"
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
          )}

          {/* Image */}
          <div className="max-w-5xl max-h-[85vh] w-full px-16 flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={park.images[lightboxIndex].url}
              alt={park.images[lightboxIndex].altText}
              className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl"
            />
            {(park.images[lightboxIndex].title || park.images[lightboxIndex].caption) && (
              <div className="text-center">
                {park.images[lightboxIndex].title && (
                  <p className="text-white font-medium text-sm">{park.images[lightboxIndex].title}</p>
                )}
                {park.images[lightboxIndex].caption && (
                  <p className="text-white/50 text-xs mt-0.5">{park.images[lightboxIndex].caption}</p>
                )}
              </div>
            )}
          </div>

          {/* Next */}
          {park.images.length > 1 && (
            <button
              className="absolute right-3 sm:right-6 p-2 text-white/70 hover:text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); lightboxNext(); }}
              aria-label="Next image"
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-gray-400">{icon}</span>
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function SideCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-gray-400">{icon}</span>
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="h-16 bg-white border-b border-gray-200" />
      <Skeleton className="w-full h-80" />
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
      <Mountain className="h-12 w-12 text-gray-300" />
      <p className="text-lg font-semibold text-gray-600">Park not found</p>
      <p className="text-sm text-gray-400">We couldn&apos;t load data for this park.</p>
      <Link href="/parks">
        <Button variant="outline" size="sm">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Parks
        </Button>
      </Link>
    </div>
  );
}
