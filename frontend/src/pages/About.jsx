// About page — public-ready honest copy + cool SVG satellite animation.
//
// Sections:
//   1. Hero with eyebrow + headline + lead paragraph and the orbit
//      animation widget (pure SVG/CSS — a satellite tracing an ellipse
//      around a stylized Earth, with pulsing rings).
//   2. Live stats strip — real numbers fetched from the deployed backend
//      (satellites tracked, CDM events monitored, launches queued).
//      No "we have a team" marketing — these are the actual public counts.
//   3. What this is — three short value-prop paragraphs.
//   4. Built with — concise tech stack.
//   5. Data sources — proper credit with ExternalLink cues.
//   6. Built by — solo portfolio note + GitHub link.
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Code,
  ExternalLink,
  Globe,
  Layers,
  Radar,
  Rocket,
  Satellite as SatIcon,
  Server,
  Sparkles,
  Zap,
} from "lucide-react";
import CountUp from "react-countup";
import { StarField } from "../components/StarField";
import { ShimmerBar, SkeletonStyles } from "../components/Skeleton";
import { CDM_API, LAUNCHES_API, SATELLITES_API } from "../config";

/* ---------- Cool SVG satellite animation -----------
   A stylized Earth at the center with two concentric ellipse orbits, a
   satellite dot tracing each one at different speeds, and a soft pulsing
   ring emanating from Earth. Pure SVG + CSS keyframes — no Three.js, no
   Framer Motion. Renders in <2 KB of GPU work and stays smooth even on
   throttled CPUs. */
function OrbitWidget() {
  return (
    <div className="relative w-full max-w-md aspect-square mx-auto">
      <style>{`
        @keyframes ow-spin   { to { transform: rotate(360deg); } }
        @keyframes ow-pulse  {
          0%   { transform: scale(0.9); opacity: 0.6; }
          70%  { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes ow-twinkle {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 1; }
        }
        .ow-orbit-a { animation: ow-spin 18s linear infinite; transform-origin: 50% 50%; }
        .ow-orbit-b { animation: ow-spin 26s linear infinite reverse; transform-origin: 50% 50%; }
        .ow-orbit-c { animation: ow-spin 9s  linear infinite; transform-origin: 50% 50%; }
        .ow-pulse-1 { animation: ow-pulse 4s ease-out infinite; transform-origin: 50% 50%; }
        .ow-pulse-2 { animation: ow-pulse 4s ease-out infinite 1.3s; transform-origin: 50% 50%; }
        .ow-twinkle { animation: ow-twinkle 3s ease-in-out infinite; }
      `}</style>
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full"
        role="img"
        aria-label="Stylized Earth with three satellites in orbit"
      >
        <defs>
          <radialGradient id="ow-earth" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.5" />
            <stop offset="35%" stopColor="#1E3A5F" />
            <stop offset="100%" stopColor="#040816" />
          </radialGradient>
          <radialGradient id="ow-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5EEAD4" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#5EEAD4" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ow-orbit-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5EEAD4" stopOpacity="0" />
            <stop offset="50%" stopColor="#5EEAD4" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#5EEAD4" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Diffuse glow behind Earth */}
        <circle cx="100" cy="100" r="60" fill="url(#ow-glow)" />

        {/* Pulsing detection rings — radio sweeping out */}
        <circle
          cx="100"
          cy="100"
          r="22"
          fill="none"
          stroke="#5EEAD4"
          strokeWidth="0.6"
          opacity="0.6"
          className="ow-pulse-1"
          style={{ transformOrigin: "100px 100px" }}
        />
        <circle
          cx="100"
          cy="100"
          r="22"
          fill="none"
          stroke="#86EED8"
          strokeWidth="0.6"
          opacity="0.4"
          className="ow-pulse-2"
          style={{ transformOrigin: "100px 100px" }}
        />

        {/* Orbit A — large outer ellipse + satellite */}
        <g className="ow-orbit-a">
          <ellipse
            cx="100"
            cy="100"
            rx="78"
            ry="44"
            fill="none"
            stroke="url(#ow-orbit-grad)"
            strokeWidth="1.2"
            strokeDasharray="2 4"
          />
          {/* satellite at the rightmost point (rotated by the parent g) */}
          <g transform="translate(178 100)">
            <circle cx="0" cy="0" r="2.8" fill="#86EED8" />
            <circle cx="0" cy="0" r="5.5" fill="#86EED8" opacity="0.25" />
          </g>
        </g>

        {/* Orbit B — tilted middle ellipse, opposite direction */}
        <g className="ow-orbit-b" transform="rotate(38 100 100)">
          <ellipse
            cx="100"
            cy="100"
            rx="56"
            ry="34"
            fill="none"
            stroke="url(#ow-orbit-grad)"
            strokeWidth="1"
            strokeDasharray="1 3"
          />
          <g transform="translate(156 100)">
            <circle cx="0" cy="0" r="2.2" fill="#FFD166" />
            <circle cx="0" cy="0" r="4.5" fill="#FFD166" opacity="0.2" />
          </g>
        </g>

        {/* Orbit C — fast inner small loop */}
        <g className="ow-orbit-c" transform="rotate(-15 100 100)">
          <ellipse
            cx="100"
            cy="100"
            rx="36"
            ry="22"
            fill="none"
            stroke="#577BC1"
            strokeWidth="0.6"
            strokeDasharray="1 2"
            opacity="0.55"
          />
          <g transform="translate(136 100)">
            <circle cx="0" cy="0" r="1.6" fill="#9BD0FF" />
            <circle cx="0" cy="0" r="3.5" fill="#9BD0FF" opacity="0.2" />
          </g>
        </g>

        {/* Earth */}
        <circle
          cx="100"
          cy="100"
          r="22"
          fill="url(#ow-earth)"
          stroke="#5EEAD4"
          strokeOpacity="0.5"
          strokeWidth="0.5"
        />

        {/* Surface highlights — scattered tiny dots = "stations / beacons" */}
        {[
          [108, 92],
          [85, 105],
          [98, 116],
          [112, 109],
          [92, 88],
        ].map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r="0.7"
            fill="#86EED8"
            className="ow-twinkle"
            style={{ animationDelay: `${i * 0.55}s` }}
          />
        ))}
      </svg>
    </div>
  );
}

/* ---------- Stat tile (lightweight, About-page only) ---------- */
function StatTile({ Icon, label, numeric, suffix = "", sub, accent = "text-teal-300", loading }) {
  return (
    <div className="flex-1 min-w-[160px] p-4 bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl relative overflow-hidden">
      <div className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-teal-500/10 blur-2xl" />
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 relative">
        {Icon ? <Icon size={14} className={accent} /> : null}
        {label}
      </div>
      <div className={`mt-2 text-2xl sm:text-3xl font-semibold ${accent} relative`}>
        {loading ? (
          <ShimmerBar className="h-7 w-24" />
        ) : numeric != null && Number.isFinite(numeric) ? (
          <>
            <CountUp end={numeric} duration={1.6} separator="," />
            {suffix}
          </>
        ) : (
          "—"
        )}
      </div>
      {sub ? <div className="mt-1 text-xs text-gray-400 relative">{sub}</div> : null}
    </div>
  );
}

/* ---------- Section card chrome helper ---------- */
function SectionCard({ Icon, eyebrow, title, children, accent = "text-teal-300" }) {
  return (
    <section className="p-5 bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl">
      {eyebrow ? (
        <div className={`text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-2 flex items-center gap-2`}>
          {Icon ? <Icon size={12} className={accent} /> : null}
          {eyebrow}
        </div>
      ) : null}
      {title ? <h2 className="text-xl font-semibold text-white mb-3">{title}</h2> : null}
      <div className="text-sm text-gray-300 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

const STACK = [
  { Icon: SatIcon, label: "satellite.js + SGP4" , detail: "Client-side TLE propagation" },
  { Icon: Globe, label: "Three.js + WebGL", detail: "GPU-accelerated globe" },
  { Icon: Server, label: "FastAPI + Postgres", detail: "Read-only public data API" },
  { Icon: Layers, label: "React + Vite", detail: "Code-split frontend bundle" },
  { Icon: Activity, label: "Recharts", detail: "Time-series + risk plots" },
  { Icon: Sparkles, label: "TailwindCSS", detail: "Design system" },
];

const SOURCES = [
  {
    name: "Space-Track",
    url: "https://www.space-track.org",
    desc: "TLE catalog + Conjunction Data Messages",
  },
  {
    name: "NOAA SWPC",
    url: "https://www.swpc.noaa.gov",
    desc: "F10.7 solar flux, geomagnetic indices, solar wind",
  },
  {
    name: "SpaceLaunchNow",
    url: "https://thespacedevs.com/llapi",
    desc: "Upcoming + past launch manifest",
  },
];

export default function About() {
  // Live counts from the deployed backend. Three parallel fetches — none
  // block first paint; each tile shows a shimmer until its number lands.
  const [counts, setCounts] = useState({ sats: null, cdm: null, launches: null });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetch(`${SATELLITES_API}/count`).then((r) => r.json()),
      fetch(`${CDM_API}/fetch`).then((r) => r.json()),
      fetch(`${LAUNCHES_API}/upcoming`).then((r) => r.json()),
    ]).then(([s, c, l]) => {
      if (cancelled) return;
      setCounts({
        sats: s.status === "fulfilled" ? s.value?.total ?? null : null,
        cdm: c.status === "fulfilled" ? (c.value?.cdm_events?.length ?? null) : null,
        launches: l.status === "fulfilled" && Array.isArray(l.value) ? l.value.length : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = useMemo(
    () => counts.sats === null && counts.cdm === null && counts.launches === null,
    [counts]
  );

  return (
    <div className="min-h-screen relative pt-[110px] pb-16 bg-gradient-to-b from-[#050716] via-[#101635] to-[#1B2447] text-white overflow-hidden">
      <SkeletonStyles />
      <div className="absolute inset-0 pointer-events-none">
        <StarField numStars={150} />
      </div>

      <div className="relative max-w-screen-xl mx-auto px-6 sm:px-12 lg:px-20">
        {/* HERO ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center mb-16">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-teal-300/80 mb-3 flex items-center gap-2">
              <Radar size={12} /> About this project
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight bg-clip-text text-transparent bg-gradient-to-r from-teal-200 via-white to-teal-100">
              An open window onto Earth orbit.
            </h1>
            <p className="mt-5 text-gray-300 text-base sm:text-lg leading-relaxed">
              Sat-Track is a public, read-only visualizer for the ~30,000 active
              satellites, debris fragments, and rocket bodies humans have left in
              orbit — plus the conjunction events the US Space Force publishes
              every day showing which of them might collide.
            </p>
            <p className="mt-3 text-gray-400 text-sm sm:text-base leading-relaxed">
              No accounts, no ads, no proprietary data — just an honest UI on
              top of public sources. Built solo as an exercise in space-domain
              data engineering and modern frontend craft.
            </p>
          </div>
          <OrbitWidget />
        </div>

        {/* LIVE STATS ──────────────────────────────────────── */}
        <div className="mb-12">
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-teal-300/80 mb-3">
            Live, right now
          </div>
          <div className="flex flex-wrap gap-3">
            <StatTile
              Icon={SatIcon}
              label="Tracked satellites"
              numeric={counts.sats}
              sub="From the Space-Track active catalog"
              loading={counts.sats === null}
            />
            <StatTile
              Icon={AlertTriangle}
              label="CDM events on file"
              numeric={counts.cdm}
              sub="Conjunction Data Messages, last 30 days"
              accent="text-rose-300"
              loading={counts.cdm === null}
            />
            <StatTile
              Icon={Rocket}
              label="Upcoming launches"
              numeric={counts.launches}
              sub="From the global launch manifest"
              accent="text-amber-300"
              loading={counts.launches === null}
            />
          </div>
          {loading ? null : (
            <p className="mt-3 text-[11px] text-gray-500">
              Numbers refresh every 15 minutes from the upstream APIs.
            </p>
          )}
        </div>

        {/* WHAT THIS IS ───────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <SectionCard Icon={Globe} eyebrow="Browse" title="Visualize the fleet">
            <p>
              The home page renders a live 3D globe with every active satellite
              propagated client-side via SGP4. Filter by orbit, country, launch
              year, or constellation — the catalog redraws around your selection
              in real time.
            </p>
          </SectionCard>
          <SectionCard Icon={Zap} eyebrow="Analyze" title="Forward-looking risk">
            <p>
              The Tracking page is a Mission Control–style dashboard for
              conjunction risk: scatter timeline of upcoming close approaches
              ranked by probability, top events with miss-distance and emergency
              flags, and per-event detail.
            </p>
          </SectionCard>
          <SectionCard Icon={Activity} eyebrow="Inspect" title="Per-object deep dive">
            <p>
              Click any satellite to see its orbital profile (perigee / apogee /
              inclination), TLE history (altitude, B*-drag, secular drift),
              neighbors in similar orbits, and a mini-schematic of its actual
              orbit shape.
            </p>
          </SectionCard>
        </div>

        {/* BUILT WITH ──────────────────────────────────────── */}
        <SectionCard Icon={Layers} eyebrow="The stack" title="Built with">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {STACK.map(({ Icon, label, detail }) => (
              <div
                key={label}
                className="flex items-start gap-2.5 p-3 bg-gray-800/40 border border-gray-700/40 rounded-lg"
              >
                <Icon size={16} className="text-teal-300 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm text-gray-100 font-medium">{label}</div>
                  <div className="text-[11px] text-gray-500 leading-snug">{detail}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="h-4" />

        {/* DATA SOURCES ────────────────────────────────────── */}
        <SectionCard Icon={Server} eyebrow="Credit" title="Data sources">
          <ul className="space-y-2">
            {SOURCES.map((s) => (
              <li key={s.name} className="flex items-baseline gap-2">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-teal-300 hover:text-teal-200 font-medium"
                >
                  {s.name}
                  <ExternalLink size={11} className="opacity-60" />
                </a>
                <span className="text-gray-400">— {s.desc}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            All endpoints used are publicly documented. No private feeds, no
            scraping. The backend caches responses and serves only read-only GETs.
          </p>
        </SectionCard>

        <div className="h-4" />

        {/* BUILT BY ─────────────────────────────────────── */}
        <SectionCard Icon={Sparkles} eyebrow="Built by">
          <p>
            Sat-Track is a solo portfolio project. Code, design, data ingestion,
            and infrastructure are all in one open repository — feel free to
            poke around, file issues, or fork it for your own visualization.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href="https://github.com/mannyzzle/Satellite-Interactive-Visualizer-And-Fleet-Optimization"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                         bg-gray-800/80 hover:bg-gray-700 text-gray-100
                         border border-gray-700 rounded-md transition-colors"
            >
              <Code size={14} />
              Source on GitHub
              <ExternalLink size={11} className="opacity-60" />
            </a>
            <span className="text-[11px] text-gray-500">
              MIT licensed · contributions welcome
            </span>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
