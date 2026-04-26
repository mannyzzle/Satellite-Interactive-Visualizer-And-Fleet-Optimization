// Per-satellite deep-dive page reached from the catalog table.
//
// Layout: hero with status pill + ID strip → vital signs (4 KPI tiles) →
// orbit profile + provenance side by side → tabbed altitude/velocity/B*
// chart panel → neighbors row → collapsible historical TLE table.
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Activity,
  AlertTriangle,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  Globe,
  MapPin,
  Orbit,
  Rocket,
  Satellite as SatIcon,
  TrendingUp,
} from "lucide-react";
import * as satellite from "satellite.js";
import CountUp from "react-countup";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchSatelliteByName,
  fetchHistoricalTLEs,
} from "../api/satelliteService";
import { SATELLITES_API } from "../config";
import { StarField } from "../components/StarField";
import { KpiSkeleton } from "../components/KpiTile";
import { ShimmerBar, SkeletonStyles } from "../components/Skeleton";
import { getCountryFlag, getCountryName } from "../lib/countries";

/* ---------- Custom dark Recharts tooltip (shared) ---------- */
function ChartTooltip({ active, payload, label, unit, accentColor }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "rgba(8, 16, 28, 0.95)",
        border: `1px solid ${accentColor}66`,
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 12,
        color: "#E5F4F1",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ color: "#9FCBC2", marginBottom: 2 }}>{label}</div>
      <div style={{ color: accentColor, fontWeight: 600 }}>
        {payload[0].value}
        {unit ? ` ${unit}` : ""}
      </div>
    </div>
  );
}

/* ---------- Status pill mapping ---------- */
const STATUS_STYLES = {
  Active: {
    pill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    dot: "bg-emerald-400",
    pulse: true,
  },
  Decaying: {
    pill: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    dot: "bg-amber-400",
    pulse: true,
  },
  Inactive: {
    pill: "bg-slate-500/15 text-slate-300 border-slate-500/40",
    dot: "bg-slate-400",
    pulse: false,
  },
};
function statusInfo(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.Inactive;
}

/* ---------- Animated KPI tile w/ CountUp + optional sparkline ----------
   Uses react-countup (already installed; SatelliteCounter uses it too).
   When `numeric` is provided we animate the count; otherwise we render the
   string directly (e.g., "3h ago"). */
function AnimatedKpiTile({
  Icon,
  label,
  numeric,
  value,
  decimals = 0,
  suffix = "",
  sub,
  accent = "text-teal-300",
  spark = null,
}) {
  return (
    <div className="flex-1 min-w-[180px] p-4 bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl relative overflow-hidden">
      {/* Subtle gradient corner accent */}
      <div className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-teal-500/10 blur-2xl" />
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 relative">
        {Icon ? <Icon size={14} className={accent} /> : null}
        {label}
      </div>
      <div className={`mt-2 text-2xl sm:text-3xl font-semibold ${accent} relative`}>
        {numeric != null && Number.isFinite(numeric) ? (
          <>
            <CountUp end={numeric} decimals={decimals} duration={1.2} separator="," />
            {suffix}
          </>
        ) : (
          value ?? "—"
        )}
      </div>
      {sub ? (
        <div className="mt-1 text-xs text-gray-400 truncate relative">{sub}</div>
      ) : null}
      {spark}
    </div>
  );
}

/* ---------- Mini SVG sparkline. Stable, no axes, just shape. ---------- */
function Sparkline({ data, color = "#5EEAD4", height = 28 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 100;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const last = data[data.length - 1];
  const lastX = w;
  const lastY = height - ((last - min) / range) * (height - 2) - 1;
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className="absolute right-2 bottom-2 w-20 h-7 opacity-80"
    >
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" />
      <circle cx={lastX} cy={lastY} r="1.8" fill={color} />
    </svg>
  );
}

/* ---------- Mini orbit schematic SVG.
   Draws Earth circle + the satellite's elliptical orbit + perigee/apogee
   markers. Inclination is communicated via a tilted ellipse. Pure SVG,
   no external lib. */
function OrbitSchematic({ sat }) {
  if (!sat || sat.perigee == null || sat.apogee == null) return null;
  const perigee = Number(sat.perigee);
  const apogee = Number(sat.apogee);
  const inclination = Number(sat.inclination ?? 0);

  // Map altitudes (km from Earth surface) to a stylized canvas where
  // Earth radius is 60 px. We log-compress altitudes so LEO and GEO both
  // fit on the same diagram.
  const earthR = 60;
  const earthKm = 6378.137;
  const aKm = (perigee + apogee) / 2 + earthKm; // semi-major axis (km)
  const eccentricity = aKm > 0 ? (apogee - perigee) / (apogee + perigee + 2 * earthKm) : 0;
  const aPx = earthR * (1 + Math.log10(1 + (aKm - earthKm) / 1000) * 0.7);
  const bPx = aPx * Math.sqrt(1 - Math.min(0.9, eccentricity) ** 2);
  const cx = 110;
  const cy = 90;

  // Ellipse focus offset (Earth at one focus)
  const fx = cx - aPx * eccentricity;
  return (
    <svg
      viewBox="0 0 220 180"
      className="w-full h-44 sm:h-48"
      role="img"
      aria-label="Orbit schematic"
    >
      <defs>
        <radialGradient id="earth-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="70%" stopColor="#0b1730" />
          <stop offset="100%" stopColor="#040816" />
        </radialGradient>
        <linearGradient id="orbit-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5EEAD4" stopOpacity="0.2" />
          <stop offset="50%" stopColor="#5EEAD4" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#5EEAD4" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {/* Background grid */}
      <g stroke="#1f2937" strokeWidth="0.5" opacity="0.6">
        <line x1="0" y1={cy} x2="220" y2={cy} />
        <line x1={cx} y1="0" x2={cx} y2="180" />
      </g>

      {/* Orbit ellipse — tilted by inclination for visual flavor (not
          physically accurate, but conveys the parameter). Earth sits at
          the right focus of the ellipse (eccentric, not centered). */}
      <g transform={`rotate(${inclination * 0.45} ${cx} ${cy})`}>
        <ellipse
          cx={fx}
          cy={cy}
          rx={aPx}
          ry={bPx}
          fill="none"
          stroke="url(#orbit-grad)"
          strokeWidth="1.5"
          strokeDasharray="2 3"
        />
        {/* Perigee marker (closest point — left side of ellipse) */}
        <circle cx={fx - aPx} cy={cy} r="2.5" fill="#FFD166" />
        <text x={fx - aPx - 4} y={cy - 6} fill="#FFD166" fontSize="7" textAnchor="end">
          peri
        </text>
        {/* Apogee marker */}
        <circle cx={fx + aPx} cy={cy} r="2.5" fill="#86EED8" />
        <text x={fx + aPx + 4} y={cy - 6} fill="#86EED8" fontSize="7">
          apo
        </text>
      </g>

      {/* Earth */}
      <circle cx={cx} cy={cy} r={earthR / 2.5} fill="url(#earth-grad)" stroke="#5EEAD4" strokeOpacity="0.4" strokeWidth="0.5" />

      {/* Inclination tag */}
      <text x="8" y="14" fontSize="9" fill="#9FCBC2" fontFamily="monospace">
        i = {inclination.toFixed(1)}°
      </text>
      <text x="8" y="170" fontSize="9" fill="#9FCBC2" fontFamily="monospace">
        e = {eccentricity.toFixed(4)}
      </text>
    </svg>
  );
}

/* ---------- TLE history → time-series ---------- */
function processTLEs(tles) {
  return tles
    .map(({ epoch, tle_line1, tle_line2 }) => {
      if (!tle_line1 || !tle_line2) return null;
      try {
        const satrec = satellite.twoline2satrec(tle_line1, tle_line2);
        if (!satrec) return null;
        const dateObj = new Date(epoch);
        const pv = satellite.propagate(satrec, dateObj);
        if (!pv?.position) return null;
        const altitudeKm =
          Math.sqrt(
            pv.position.x ** 2 + pv.position.y ** 2 + pv.position.z ** 2
          ) - 6378.137;
        const v = pv.velocity;
        const speed = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
        return {
          epoch: dateObj.toISOString().split("T")[0],
          altitude: Number(altitudeKm.toFixed(2)),
          velocity: Number(speed.toFixed(3)),
          bstar: Number(satrec.bstar.toExponential(2)),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/* ---------- Hero / metric helpers ---------- */
function fmt(n, digits = 2, suffix = "") {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  return `${v.toFixed(digits)}${suffix}`;
}
function timeAgo(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/* ---------- Tabbed chart panel ---------- */
const CHART_TABS = [
  { id: "altitude", label: "Altitude", color: "#72E2AE", unit: "km" },
  { id: "velocity", label: "Velocity", color: "#FFD166", unit: "km/s" },
  { id: "bstar", label: "B*", color: "#577BC1", unit: "1/ER" },
];

function ChartPanel({ data }) {
  const [tab, setTab] = useState("altitude");
  const meta = CHART_TABS.find((t) => t.id === tab);

  // Compute first/last/delta so the chart header tells a story instead of
  // making the user mentally diff the line.
  const stats = useMemo(() => {
    if (data.length < 2) return null;
    const first = data[0][tab];
    const last = data[data.length - 1][tab];
    const min = Math.min(...data.map((d) => d[tab]));
    const max = Math.max(...data.map((d) => d[tab]));
    return { first, last, delta: last - first, min, max };
  }, [data, tab]);

  return (
    <div className="bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl p-4 relative overflow-hidden">
      {/* Top color accent bar matching the active series — micro-detail
          that makes the panel feel polished. */}
      <div
        className="absolute top-0 inset-x-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${meta.color}aa, transparent)`,
        }}
      />
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-baseline gap-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 flex items-center gap-2">
            <TrendingUp size={12} style={{ color: meta.color }} /> Time series
          </div>
          {stats ? (
            <span className="text-xs text-gray-400 font-mono">
              <span style={{ color: meta.color }}>{Number(stats.last).toFixed(2)}</span>
              {" "}
              {meta.unit}
              {" · "}
              <span
                className={
                  stats.delta > 0
                    ? "text-emerald-300"
                    : stats.delta < 0
                    ? "text-rose-300"
                    : "text-gray-500"
                }
              >
                {stats.delta >= 0 ? "+" : ""}
                {stats.delta.toFixed(2)}
              </span>{" "}
              over window
            </span>
          ) : null}
        </div>
        <div className="inline-flex bg-gray-800/60 border border-gray-700/60 rounded-md p-0.5">
          {CHART_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                tab === t.id
                  ? "bg-teal-500/20 text-teal-100"
                  : "text-gray-400 hover:text-white"
              }`}
              style={
                tab === t.id
                  ? { boxShadow: `inset 0 0 0 1px ${t.color}55` }
                  : undefined
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <div className="h-[260px] flex items-center justify-center text-gray-500 text-sm">
          No archived TLEs to chart yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id={`grad-${tab}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={meta.color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={meta.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="epoch" stroke="#6b7280" fontSize={11} />
            <YAxis stroke="#6b7280" fontSize={11} domain={["auto", "auto"]} />
            <Tooltip
              content={(p) => (
                <ChartTooltip {...p} unit={meta.unit} accentColor={meta.color} />
              )}
            />
            <Area
              type="monotone"
              dataKey={tab}
              stroke={meta.color}
              strokeWidth={2}
              fill={`url(#grad-${tab})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/* ---------- Neighbors panel ---------- */
function NeighborsRow({ norad }) {
  const [neighbors, setNeighbors] = useState([]);
  const [state, setState] = useState("loading"); // 'loading' | 'ok' | 'empty'

  useEffect(() => {
    if (!norad) return;
    setState("loading");
    fetch(`${SATELLITES_API}/nearby/${norad}?limit=8`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list = data?.satellites || data?.nearby || data || [];
        const arr = Array.isArray(list) ? list : [];
        setNeighbors(arr);
        setState(arr.length ? "ok" : "empty");
      })
      .catch(() => setState("empty"));
  }, [norad]);

  if (state === "empty") return null;

  return (
    <div className="bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl p-4 mb-6">
      <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-3 flex items-center gap-2">
        <SatIcon size={12} /> Satellites in similar orbits
      </div>
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="flex gap-2 min-w-min">
          {state === "loading"
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="shrink-0 w-48 p-3 border border-gray-700/60 rounded-lg"
                >
                  <ShimmerBar className="h-3 w-32 mb-2" />
                  <ShimmerBar className="h-2.5 w-20" />
                </div>
              ))
            : neighbors.slice(0, 8).map((n) => (
                <Link
                  key={n.norad_number}
                  to={`/satellites/${encodeURIComponent(n.name)}`}
                  className="shrink-0 w-48 p-3 bg-gray-800/40 border border-gray-700/60 rounded-lg
                             hover:border-teal-400/50 hover:bg-gray-800/60 transition-colors"
                >
                  <div className="text-sm text-gray-100 font-medium truncate flex items-center gap-1.5">
                    <SatIcon size={12} className="text-teal-300 shrink-0" />
                    {n.name}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5 font-mono">
                    #{n.norad_number}
                    {n.orbit_type ? ` · ${n.orbit_type}` : ""}
                  </div>
                </Link>
              ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Page
   ============================================================ */
export default function SatelliteDetail() {
  const { name } = useParams();
  const navigate = useNavigate();

  const [sat, setSat] = useState(null);
  const [historicalTLEs, setHistoricalTLEs] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [error, setError] = useState(null);
  const [loadingSat, setLoadingSat] = useState(true);
  const [tleHistoryOpen, setTleHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingSat(true);
    setError(null);
    setSat(null);
    setHistoricalTLEs([]);
    setChartData([]);
    (async () => {
      try {
        const data = await fetchSatelliteByName(name);
        if (cancelled) return;
        if (!data) {
          setError(`Satellite "${name}" not found.`);
          return;
        }
        setSat(data);

        const tle = await fetchHistoricalTLEs(data.norad_number);
        if (cancelled) return;
        const list = tle?.historical_tles || [];
        setHistoricalTLEs(list);
        setChartData(processTLEs(list));
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load satellite");
      } finally {
        if (!cancelled) setLoadingSat(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  // Live-ticking re-render every 30s so "Last TLE: 2h ago" stays accurate
  // without polling the API. setInterval is cheap; the rest of the page
  // doesn't depend on `tick` so React only repaints the timestamp.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Derived "vital signs" — latest snapshot from the live record + TLE epoch.
  const vital = useMemo(() => {
    if (!sat) return null;
    const period = sat.period || (sat.mean_motion ? 1440 / sat.mean_motion : null);
    return {
      altitude:
        sat.apogee != null && sat.perigee != null
          ? (sat.apogee + sat.perigee) / 2
          : null,
      velocity: sat.velocity ?? null,
      period,
      epoch: sat.epoch,
    };
  }, [sat]);

  // Sparkline data per metric — pulled straight from the chart series.
  const sparkAltitude = useMemo(
    () => chartData.slice(-30).map((d) => d.altitude),
    [chartData]
  );
  const sparkVelocity = useMemo(
    () => chartData.slice(-30).map((d) => d.velocity),
    [chartData]
  );
  const sparkBstar = useMemo(
    () => chartData.slice(-30).map((d) => d.bstar),
    [chartData]
  );

  const sInfo = sat ? statusInfo(sat.active_status) : null;

  return (
    <div className="min-h-screen relative pt-[110px] pb-16 bg-gradient-to-b from-[#050716] via-[#101635] to-[#1B2447] text-white overflow-hidden">
      <SkeletonStyles />
      <div className="absolute inset-0 pointer-events-none">
        <StarField numStars={150} />
      </div>

      <div className="relative max-w-screen-2xl mx-auto px-6 sm:px-12 lg:px-20">
        {/* Back button */}
        <button
          onClick={() => navigate("/satellites")}
          className="mb-6 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm
                     bg-gray-800/80 hover:bg-gray-700 text-gray-200
                     border border-gray-700/60 rounded-md transition-colors"
        >
          <ArrowLeft size={14} />
          Back to catalog
        </button>

        {error ? (
          <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-200 inline-flex items-center gap-2">
            <AlertTriangle size={18} /> {error}
          </div>
        ) : null}

        {/* Hero */}
        <div className="mb-6">
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-teal-300/80 mb-2 flex items-center gap-2">
            <SatIcon size={12} /> Satellite
          </div>
          {loadingSat || !sat ? (
            <>
              <ShimmerBar className="h-10 w-2/3 max-w-xl mb-3" />
              <ShimmerBar className="h-4 w-80" />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-start gap-3 justify-between">
                {/* Gradient-text hero name — adds visual weight without
                    cluttering. */}
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight bg-clip-text text-transparent bg-gradient-to-r from-teal-200 via-white to-teal-100">
                  {sat.name}
                </h1>
                <span
                  className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium ${sInfo.pill}`}
                >
                  <span className="relative flex w-2 h-2">
                    {sInfo.pulse ? (
                      <span
                        className={`absolute inset-0 rounded-full ${sInfo.dot} opacity-75 animate-ping`}
                      />
                    ) : null}
                    <span className={`relative w-2 h-2 rounded-full ${sInfo.dot}`} />
                  </span>
                  {sat.active_status || "Unknown"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
                <span className="font-mono text-gray-300">#{sat.norad_number}</span>
                <span className="hidden sm:inline text-gray-600">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-base leading-none">{getCountryFlag(sat.country)}</span>
                  <span>{getCountryName(sat.country)}</span>
                </span>
                <span className="hidden sm:inline text-gray-600">·</span>
                <span className="inline-flex items-center gap-1">
                  <Orbit size={12} className="text-teal-300" />
                  {sat.orbit_type || "—"}
                </span>
                {sat.object_type ? (
                  <>
                    <span className="hidden sm:inline text-gray-600">·</span>
                    <span className="text-gray-400">{sat.object_type}</span>
                  </>
                ) : null}
                {sat.launch_date ? (
                  <>
                    <span className="hidden sm:inline text-gray-600">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={12} className="text-gray-500" />
                      Launched {sat.launch_date}
                    </span>
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>

        {/* Vital signs strip — count-up numerics + recent-trend sparklines */}
        <div className="flex flex-wrap gap-3 mb-8">
          {loadingSat || !vital ? (
            <>
              <KpiSkeleton />
              <KpiSkeleton />
              <KpiSkeleton />
              <KpiSkeleton />
            </>
          ) : (
            <>
              <AnimatedKpiTile
                Icon={Activity}
                label="Mean altitude"
                numeric={vital.altitude}
                decimals={0}
                suffix=" km"
                sub={
                  sat?.perigee && sat?.apogee
                    ? `Peri ${Number(sat.perigee).toFixed(0)} · Apo ${Number(sat.apogee).toFixed(0)} km`
                    : ""
                }
                spark={<Sparkline data={sparkAltitude} color="#72E2AE" />}
              />
              <AnimatedKpiTile
                Icon={TrendingUp}
                label="Velocity"
                numeric={vital.velocity}
                decimals={2}
                suffix=" km/s"
                sub="Latest TLE-derived speed"
                accent="text-amber-300"
                spark={<Sparkline data={sparkVelocity} color="#FFD166" />}
              />
              <AnimatedKpiTile
                Icon={Orbit}
                label="Orbit period"
                numeric={vital.period}
                decimals={1}
                suffix=" min"
                sub={sat?.mean_motion ? `${fmt(sat.mean_motion, 4)} rev/day` : ""}
                accent="text-cyan-300"
              />
              <AnimatedKpiTile
                Icon={Calendar}
                label="Last TLE"
                /* tick re-renders this string every 30s for a live feel */
                value={`${timeAgo(vital.epoch)}${tick >= 0 ? "" : ""}`}
                sub={
                  vital.epoch
                    ? new Date(vital.epoch).toUTCString().replace(" GMT", " UTC")
                    : ""
                }
                accent="text-teal-200"
              />
            </>
          )}
        </div>

        {/* Orbit profile + provenance, side-by-side */}
        {!loadingSat && sat ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            <section className="p-5 bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl">
              <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-3 flex items-center gap-2">
                <Orbit size={12} /> Orbit profile
              </div>
              {/* Mini orbit schematic — scales perigee/apogee + inclination
                  to a stylized SVG so the analyst doesn't have to mentally
                  visualize the numbers. */}
              <OrbitSchematic sat={sat} />
              <dl className="mt-3 grid grid-cols-2 gap-y-1.5 gap-x-6 text-sm">
                <dt className="text-gray-500">Inclination</dt>
                <dd className="text-gray-100 font-mono">{fmt(sat.inclination, 3, "°")}</dd>
                <dt className="text-gray-500">Eccentricity</dt>
                <dd className="text-gray-100 font-mono">{fmt(sat.eccentricity, 5)}</dd>
                <dt className="text-gray-500">Semi-major axis</dt>
                <dd className="text-gray-100 font-mono">{fmt(sat.semi_major_axis, 1, " km")}</dd>
                <dt className="text-gray-500">Perigee</dt>
                <dd className="text-gray-100 font-mono">{fmt(sat.perigee, 1, " km")}</dd>
                <dt className="text-gray-500">Apogee</dt>
                <dd className="text-gray-100 font-mono">{fmt(sat.apogee, 1, " km")}</dd>
                <dt className="text-gray-500">RAAN</dt>
                <dd className="text-gray-100 font-mono">{fmt(sat.raan, 3, "°")}</dd>
                <dt className="text-gray-500">Arg. perigee</dt>
                <dd className="text-gray-100 font-mono">{fmt(sat.arg_perigee, 3, "°")}</dd>
                <dt className="text-gray-500">B* drag</dt>
                <dd className="text-gray-100 font-mono">
                  {sat.bstar != null ? Number(sat.bstar).toExponential(3) : "—"}
                </dd>
              </dl>
            </section>

            <section className="p-5 bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl">
              <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-3 flex items-center gap-2">
                <Rocket size={12} /> Origin & manufacture
              </div>
              <dl className="grid grid-cols-2 gap-y-1.5 gap-x-6 text-sm">
                <dt className="text-gray-500 inline-flex items-center gap-1.5">
                  <Calendar size={12} /> Launch date
                </dt>
                <dd className="text-gray-100">{sat.launch_date || "—"}</dd>
                <dt className="text-gray-500 inline-flex items-center gap-1.5">
                  <MapPin size={12} /> Launch site
                </dt>
                <dd className="text-gray-100">{sat.launch_site || "—"}</dd>
                <dt className="text-gray-500 inline-flex items-center gap-1.5">
                  <Globe size={12} /> Country
                </dt>
                <dd className="text-gray-100">{sat.country || "—"}</dd>
                <dt className="text-gray-500 inline-flex items-center gap-1.5">
                  <Building2 size={12} /> Object type
                </dt>
                <dd className="text-gray-100">{sat.object_type || "—"}</dd>
                <dt className="text-gray-500">Purpose</dt>
                <dd className="text-gray-100 truncate">{sat.purpose || "—"}</dd>
                <dt className="text-gray-500">RCS</dt>
                <dd className="text-gray-100">{sat.rcs || "—"}</dd>
                {sat.decay_date ? (
                  <>
                    <dt className="text-gray-500">Decayed</dt>
                    <dd className="text-amber-300">{sat.decay_date}</dd>
                  </>
                ) : null}
                <dt className="text-gray-500">Intl. designator</dt>
                <dd className="text-gray-100 font-mono">{sat.intl_designator || "—"}</dd>
              </dl>
            </section>
          </div>
        ) : null}

        {/* Tabbed time-series chart */}
        {!loadingSat ? (
          <div className="mb-6">
            <ChartPanel data={chartData} />
          </div>
        ) : null}

        {/* Neighbors */}
        {!loadingSat && sat ? <NeighborsRow norad={sat.norad_number} /> : null}

        {/* Historical TLE table — disclosure */}
        {!loadingSat && historicalTLEs.length > 0 ? (
          <div className="bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl overflow-hidden">
            <button
              onClick={() => setTleHistoryOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-800/40 transition-colors"
              aria-expanded={tleHistoryOpen}
            >
              <span className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500">
                  Historical TLE
                </span>
                <span className="text-gray-300">
                  {historicalTLEs.length} record{historicalTLEs.length === 1 ? "" : "s"}
                </span>
              </span>
              <ChevronDown
                size={16}
                className={`text-gray-400 transition-transform ${tleHistoryOpen ? "rotate-180" : ""}`}
              />
            </button>
            {tleHistoryOpen ? (
              <div className="overflow-x-auto border-t border-gray-700/60">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-gray-800/40 text-gray-400">
                    <tr>
                      <th className="text-left px-4 py-2">Epoch</th>
                      <th className="text-left px-4 py-2">Line 1</th>
                      <th className="text-left px-4 py-2">Line 2</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicalTLEs.map((t, i) => (
                      <tr key={i} className="border-t border-gray-800/60">
                        <td className="px-4 py-1.5 whitespace-nowrap">{t.epoch}</td>
                        <td className="px-4 py-1.5 whitespace-pre">{t.tle_line1}</td>
                        <td className="px-4 py-1.5 whitespace-pre">{t.tle_line2}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
