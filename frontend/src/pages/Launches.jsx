// Upcoming launches feed — modernized.
//
// Layout:
//  - Hero KPI strip (4 tiles) — total upcoming, next launch countdown,
//    launches this week, missions covered.
//  - "Next up" featured card with hero image + cinematic overlay.
//  - Status filter chip strip.
//  - Card grid (modern translucent chrome, status pill, status-aware
//    countdown that goes amber < 24h and rose < 1h).
import { useEffect, useMemo, useRef, useState } from "react";
// note: useMemo + useRef + useState are intentional — the page derives
// `featured`, `rest`, and `weekCount` from the fetched array each render.
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  ExternalLink,
  Globe,
  MapPin,
  Rocket,
  Users,
  Video,
} from "lucide-react";
import { StarField } from "../components/StarField";
import { ShimmerBar, SkeletonStyles } from "../components/Skeleton";
import { LAUNCHES_API } from "../config";

/* ---------- Countdown leaf — 1Hz tick via ref, no parent re-render ----
   The component also flips its own color as the launch nears: rose under
   1 hour, amber under 24 hours, teal otherwise. Color is swapped via a
   class on the wrapping span; the ref node only updates textContent. */
export function Countdown({ launchDate, big = false }) {
  const ref = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const COLOR = {
      hot: "text-rose-300",
      warm: "text-amber-300",
      cool: "text-teal-200",
    };
    const allClasses = Object.values(COLOR).join(" ");

    const setColor = (cls) => {
      if (!wrapRef.current) return;
      wrapRef.current.classList.remove(...allClasses.split(" "));
      wrapRef.current.classList.add(cls);
    };

    if (!launchDate) {
      if (ref.current) ref.current.textContent = "🚀 Launched!";
      setColor(COLOR.cool);
      return;
    }
    const target = new Date(launchDate).getTime();

    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        if (ref.current) ref.current.textContent = "🚀 Launched!";
        setColor(COLOR.cool);
        return false;
      }
      const days = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1000);
      if (ref.current) {
        ref.current.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
      }
      setColor(diff < 3_600_000 ? COLOR.hot : diff < 86_400_000 ? COLOR.warm : COLOR.cool);
      return true;
    };
    tick();
    const id = setInterval(() => {
      if (!tick()) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [launchDate]);

  return (
    <span
      ref={wrapRef}
      className={`${
        big ? "text-2xl sm:text-3xl md:text-4xl" : "text-base sm:text-lg"
      } font-semibold tracking-wider tabular-nums`}
    >
      <span ref={ref} />
    </span>
  );
}

/* ---------- Status pill mapping ---------- */
const STATUS_STYLES = {
  "Go for Launch": {
    pill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    dot: "bg-emerald-400",
    pulse: true,
    short: "GO",
  },
  Success: {
    pill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    dot: "bg-emerald-400",
    pulse: false,
    short: "OK",
  },
  Failure: {
    pill: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    dot: "bg-rose-400",
    pulse: false,
    short: "FAIL",
  },
  Hold: {
    pill: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    dot: "bg-amber-400",
    pulse: true,
    short: "HOLD",
  },
  "To Be Confirmed": {
    pill: "bg-slate-500/15 text-slate-300 border-slate-500/40",
    dot: "bg-slate-400",
    pulse: false,
    short: "TBC",
  },
  "To Be Determined": {
    pill: "bg-slate-500/15 text-slate-300 border-slate-500/40",
    dot: "bg-slate-400",
    pulse: false,
    short: "TBD",
  },
};
const DEFAULT_STATUS = STATUS_STYLES["To Be Determined"];
const statusInfo = (s) => STATUS_STYLES[s] || DEFAULT_STATUS;

/* ---------- Status pill ---------- */
function StatusPill({ status }) {
  const info = statusInfo(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium ${info.pill}`}
    >
      <span className="relative flex w-1.5 h-1.5">
        {info.pulse ? (
          <span className={`absolute inset-0 rounded-full ${info.dot} opacity-75 animate-ping`} />
        ) : null}
        <span className={`relative w-1.5 h-1.5 rounded-full ${info.dot}`} />
      </span>
      {status || "Unknown"}
    </span>
  );
}

/* ---------- KPI tile ---------- */
function KpiTile({ Icon, label, value, sub, accent = "text-teal-300" }) {
  return (
    <div className="flex-1 min-w-[180px] p-4 bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl relative overflow-hidden">
      <div className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-teal-500/10 blur-2xl" />
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 relative">
        {Icon ? <Icon size={14} className={accent} /> : null}
        {label}
      </div>
      <div className={`mt-2 text-2xl sm:text-3xl font-semibold ${accent} relative`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-gray-400 truncate relative">{sub}</div> : null}
    </div>
  );
}
function KpiSkeleton() {
  return (
    <div className="flex-1 min-w-[180px] p-4 bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl">
      <ShimmerBar className="h-3 w-24 mb-3" />
      <ShimmerBar className="h-8 w-32 mb-2" />
      <ShimmerBar className="h-3 w-40" />
    </div>
  );
}

/* ---------- Card skeleton ---------- */
function CardSkeleton() {
  return (
    <div className="p-4 bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl">
      <ShimmerBar className="w-full h-40 rounded-md mb-3" />
      <ShimmerBar className="h-4 w-3/4 mb-2" />
      <ShimmerBar className="h-3 w-full mb-1.5" />
      <ShimmerBar className="h-3 w-5/6 mb-3" />
      <ShimmerBar className="h-7 w-32 mb-2" />
      <ShimmerBar className="h-8 w-40" />
    </div>
  );
}

/* ---------- Featured card (next launch up top) ---------- */
function FeaturedCard({ launch }) {
  if (!launch) return null;
  const info = statusInfo(launch.launch_status);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-700/60 bg-gray-900/85 backdrop-blur-xl mb-8 group">
      {/* Hero image with cinematic gradient overlays */}
      <div className="relative h-64 sm:h-80 md:h-96 w-full">
        <img
          src={launch.image_url || `${import.meta.env.BASE_URL}favicon.svg`}
          alt={launch.name}
          loading="eager"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050716] via-[#050716]/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050716]/85 via-transparent to-transparent" />

        {/* Eyebrow + status, top-left */}
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-teal-300/90">
            Next up
          </span>
          <StatusPill status={launch.launch_status} />
        </div>

        {/* Watch live button, top-right */}
        {launch.video_url ? (
          <a
            href={launch.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                       bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40
                       text-rose-200 rounded-full backdrop-blur-md transition-colors"
          >
            <Video size={14} />
            Watch live
          </a>
        ) : null}

        {/* Content overlay */}
        <div className="absolute bottom-0 inset-x-0 p-5 sm:p-7">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight">
            {launch.name}
          </h2>
          {launch.mission_description ? (
            <p className="mt-2 text-gray-300 text-sm sm:text-base max-w-3xl line-clamp-2">
              {launch.mission_description}
            </p>
          ) : null}
        </div>
      </div>

      {/* Bottom info strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5 border-t border-gray-700/60">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-1 flex items-center gap-1">
            <Calendar size={11} /> T-minus
          </div>
          <Countdown launchDate={launch.launch_date} big />
          <div className="mt-1 text-[11px] text-gray-500">
            {launch.launch_date ? new Date(launch.launch_date).toUTCString().replace(" GMT", " UTC") : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-1 flex items-center gap-1">
            <Rocket size={11} /> Vehicle
          </div>
          <div className="text-sm text-gray-100 truncate">{launch.rocket_name || "—"}</div>
          {launch.reused_rocket ? (
            <div className="mt-0.5 text-[10px] text-teal-300 inline-flex items-center gap-1">
              ♻ Reused booster
            </div>
          ) : null}
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-1 flex items-center gap-1">
            <MapPin size={11} /> Pad
          </div>
          {launch.map_url ? (
            <a
              href={launch.map_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-gray-100 hover:text-teal-200 inline-flex items-center gap-1"
            >
              {launch.pad_name || "Unknown"}
              <ExternalLink size={11} className="opacity-60" />
            </a>
          ) : (
            <div className="text-sm text-gray-100 truncate">{launch.pad_name || "—"}</div>
          )}
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-1 flex items-center gap-1">
            <Globe size={11} /> Payload
          </div>
          <div className="text-sm text-gray-100 truncate">
            {launch.payload_name || launch.mission_type || "—"}
          </div>
          {launch.payload_orbit ? (
            <div className="text-[11px] text-gray-500">{launch.payload_orbit}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ---------- Compact card (grid items) ---------- */
function LaunchCard({ launch, idx }) {
  return (
    <div
      data-testid="launch-card"
      style={{
        animation: "tk-fade-in 320ms ease-out both",
        animationDelay: `${Math.min(idx, 12) * 25}ms`,
      }}
      className="group flex flex-col bg-gray-900/85 backdrop-blur-xl border border-gray-700/60
                 rounded-xl overflow-hidden
                 hover:border-teal-400/50 hover:ring-1 hover:ring-teal-400/20
                 transition-colors"
    >
      <div className="relative h-40 w-full overflow-hidden">
        <img
          src={launch.image_url || `${import.meta.env.BASE_URL}favicon.svg`}
          alt={launch.name}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover bg-gray-800
                     transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/85 via-gray-900/30 to-transparent" />
        <div className="absolute top-2 left-2">
          <StatusPill status={launch.launch_status} />
        </div>
        {launch.crew_count > 0 ? (
          <div className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                          bg-violet-500/20 border border-violet-500/40 text-violet-200 text-[10px]">
            <Users size={10} />
            Crew {launch.crew_count}
          </div>
        ) : null}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-base font-semibold text-white leading-snug line-clamp-2">
          {launch.name}
        </h3>
        {launch.mission_description ? (
          <p className="mt-1.5 text-xs text-gray-400 leading-relaxed line-clamp-2">
            {launch.mission_description}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400">
          <span className="inline-flex items-center gap-1">
            <Rocket size={11} className="text-teal-300" />
            <span className="text-gray-200 truncate max-w-[10rem]">
              {launch.rocket_name || "—"}
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin size={11} />
            <span className="truncate max-w-[10rem]">{launch.pad_name || "—"}</span>
          </span>
          {launch.mission_agency ? (
            <span className="inline-flex items-center gap-1">
              <Building2 size={11} />
              <span className="truncate max-w-[10rem]">{launch.mission_agency}</span>
            </span>
          ) : null}
        </div>

        <div className="mt-auto pt-3 flex items-end justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500">
              T-minus
            </div>
            <Countdown launchDate={launch.launch_date} />
          </div>
          {launch.video_url ? (
            <a
              href={launch.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-rose-300 hover:text-rose-200"
            >
              <Video size={12} />
              Watch
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ---------- Filter chip helpers ---------- */
const FILTERS = [
  { id: "all", label: "All" },
  { id: "go", label: "Go for launch", match: (l) => l.launch_status === "Go for Launch" },
  { id: "tbd", label: "TBD", match: (l) =>
      ["To Be Confirmed", "To Be Determined", "TBD"].includes(l.launch_status) },
  { id: "hold", label: "Hold", match: (l) => l.launch_status === "Hold" },
];

/* ============================================================
   Page
   ============================================================ */
export default function Launches() {
  const [launches, setLaunches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterId, setFilterId] = useState("all");

  // Live re-render every 30s — keeps the "next launch" KPI stable when a
  // launch slips past now() while the user is on the page.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${LAUNCHES_API}/upcoming`);
        if (!r.ok) throw new Error("Failed to fetch upcoming launches.");
        const data = await r.json();
        if (!Array.isArray(data)) throw new Error("Invalid API response.");
        if (cancelled) return;
        setLaunches(data.slice(0, 24));
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(
    () =>
      [...launches].sort(
        (a, b) => new Date(a.launch_date) - new Date(b.launch_date)
      ),
    [launches]
  );
  const upcoming = useMemo(
    () => sorted.filter((l) => new Date(l.launch_date).getTime() > Date.now()),
    [sorted]
  );
  const featured = upcoming[0];
  const rest = useMemo(() => {
    const tail = featured ? upcoming.slice(1) : sorted;
    const filt = FILTERS.find((f) => f.id === filterId);
    if (!filt?.match) return tail;
    return tail.filter(filt.match);
  }, [upcoming, sorted, featured, filterId]);

  const weekCount = useMemo(() => {
    const weekMs = 7 * 86_400_000;
    return upcoming.filter((l) => {
      const t = new Date(l.launch_date).getTime();
      return t - Date.now() < weekMs;
    }).length;
  }, [upcoming]);

  const agencies = useMemo(
    () => new Set(upcoming.map((l) => l.mission_agency).filter(Boolean)).size,
    [upcoming]
  );

  return (
    <div className="min-h-screen relative pt-[110px] pb-16 bg-gradient-to-b from-[#050716] via-[#101635] to-[#1B2447] text-white overflow-hidden">
      <SkeletonStyles />
      <style>{`
        @keyframes tk-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="absolute inset-0 pointer-events-none">
        <StarField numStars={150} />
      </div>

      <div className="relative max-w-screen-2xl mx-auto px-6 sm:px-12 lg:px-20">
        {/* Hero */}
        <div className="mb-8">
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-teal-300/80 mb-2 flex items-center gap-2">
            <Rocket size={12} /> Launch manifest
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight bg-clip-text text-transparent bg-gradient-to-r from-teal-200 via-white to-teal-100">
            Upcoming Launches
          </h1>
          <p className="mt-2 text-gray-400 max-w-3xl">
            Live forward-looking schedule pulled from SpaceLaunchNow. Hover any
            card for details, click <span className="text-rose-300">Watch</span>{" "}
            for the live stream when one is published.
          </p>
        </div>

        {/* KPI strip */}
        <div className="flex flex-wrap gap-3 mb-8">
          {loading ? (
            <>
              <KpiSkeleton />
              <KpiSkeleton />
              <KpiSkeleton />
              <KpiSkeleton />
            </>
          ) : (
            <>
              <KpiTile
                Icon={Rocket}
                label="Upcoming"
                value={upcoming.length.toLocaleString()}
                sub="Next 24 manifested"
              />
              <KpiTile
                Icon={Calendar}
                label="Next launch"
                value={featured ? <Countdown launchDate={featured.launch_date} /> : "—"}
                sub={featured ? featured.name : ""}
                accent="text-amber-300"
              />
              <KpiTile
                Icon={ArrowRight}
                label="This week"
                value={weekCount.toString()}
                sub="Launches within 7 days"
                accent="text-cyan-300"
              />
              <KpiTile
                Icon={Building2}
                label="Agencies"
                value={agencies.toString()}
                sub="Distinct providers"
                accent="text-violet-300"
              />
            </>
          )}
        </div>

        {/* Featured */}
        {loading ? (
          <CardSkeleton />
        ) : error ? (
          <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-200 inline-flex items-center gap-2 mb-8">
            <AlertCircle size={18} /> {error}
          </div>
        ) : (
          <FeaturedCard launch={featured} />
        )}

        {/* Filters */}
        {!loading && !error ? (
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            {FILTERS.map((f) => {
              const isA = filterId === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilterId(f.id)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    isA
                      ? "bg-teal-500/20 border-teal-400/60 text-teal-100"
                      : "bg-gray-900/60 border-gray-700/60 text-gray-300 hover:bg-gray-800/80 hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
            <span className="ml-auto text-xs text-gray-400">
              {rest.length.toLocaleString()} more queued
            </span>
          </div>
        ) : null}

        {/* Card grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
          ) : rest.length === 0 ? (
            <div className="col-span-full text-center text-gray-500 py-12">
              No more launches match the current filter.
            </div>
          ) : (
            rest.map((launch, idx) => (
              <LaunchCard key={launch.id || idx} launch={launch} idx={idx} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
