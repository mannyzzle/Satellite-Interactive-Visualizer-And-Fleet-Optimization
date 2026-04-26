// Tracking page — Mission Control / Conjunction Analytics dashboard.
//
// This used to be a single-satellite focus + propagation page that
// duplicated Home's flow. The redesigned page leans on data Home doesn't
// surface: collision-data-message (CDM) conjunction events. Lead with a
// forward-looking risk timeline, drill down into the highest-probability
// pairs, and link out to /satellites/<name> for per-object TLE history
// (those charts already live on the SatelliteDetail page — no duplication).
//
// Data source (no backend changes — read-only DB):
//   /api/cdm/fetch — all conjunction events
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Radar,
  Satellite as SatIcon,
  ShieldAlert,
  Zap,
} from "lucide-react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { StarField } from "../components/StarField";
import { KpiTile, KpiSkeleton } from "../components/KpiTile";
import { ShimmerBar, SkeletonStyles } from "../components/Skeleton";
import { CDM_API } from "../config";

// Filter chips applied to the timeline + table. Single-active-filter model
// to mirror the Home sidebar UX.
const FILTERS = [
  { id: "all", label: "All" },
  { id: "emergency", label: "Emergency" },
  { id: "active", label: "Has active sat" },
  { id: "debris", label: "Debris-on-debris" },
];

/** Stable key for a conjunction. Each event arrives twice (once from each
 * sat's POV) so dedupe by sorted NORAD pair + TCA. */
const eventKey = (e) => {
  const a = Math.min(e.sat_1_id, e.sat_2_id);
  const b = Math.max(e.sat_1_id, e.sat_2_id);
  return `${a}-${b}-${e.tca}`;
};

/** Dedupe + filter raw CDM rows down to upcoming, active risks. */
function shapeEvents(rows, filterId) {
  const now = Date.now();
  const seen = new Map();
  for (const r of rows) {
    if (!r.is_active) continue;
    if (!r.tca) continue;
    const tcaMs = new Date(r.tca + "Z").getTime();
    if (Number.isNaN(tcaMs) || tcaMs < now) continue;
    const k = eventKey(r);
    const prior = seen.get(k);
    if (!prior || prior.created < r.created) {
      seen.set(k, { ...r, tcaMs });
    }
  }
  let out = [...seen.values()];
  if (filterId === "emergency") out = out.filter((r) => r.emergency_reportable);
  if (filterId === "active")
    out = out.filter(
      (r) => r.sat_1_type === "PAYLOAD" || r.sat_2_type === "PAYLOAD"
    );
  if (filterId === "debris")
    out = out.filter(
      (r) => r.sat_1_type === "DEBRIS" && r.sat_2_type === "DEBRIS"
    );
  out.sort((a, b) => b.pc - a.pc);
  return out;
}

/** Pc-bucket → color (used on chart + table risk pill). */
function pcColor(pc) {
  if (pc >= 1e-4) return "#F87171"; // red-400
  if (pc >= 1e-5) return "#FBBF24"; // amber-400
  return "#5EEAD4"; // teal-300
}

/** Pretty timestamp helpers. */
const fmtUTC = (ms) => new Date(ms).toUTCString().replace(" GMT", " UTC");
const fmtCountdown = (ms) => {
  const diff = ms - Date.now();
  if (diff <= 0) return "—";
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
};

/* ---------- Custom dark Recharts tooltip ---------- */
function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const e = payload[0].payload;
  return (
    <div
      style={{
        background: "rgba(8, 16, 28, 0.95)",
        border: `1px solid ${pcColor(e.pc)}66`,
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 12,
        color: "#E5F4F1",
        minWidth: 220,
        boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ fontWeight: 600, color: pcColor(e.pc), marginBottom: 4 }}>
        Pc {(e.pc * 100).toFixed(4)}%
      </div>
      <div style={{ color: "#9FCBC2" }}>
        TCA: <span style={{ color: "#E5F4F1" }}>{fmtUTC(e.tcaMs)}</span>
      </div>
      <div style={{ color: "#9FCBC2" }}>
        Miss: <span style={{ color: "#E5F4F1" }}>{e.min_rng} km</span>
      </div>
      <div style={{ marginTop: 4 }}>
        {e.sat_1_name} <span style={{ color: "#7A9C97" }}>×</span>{" "}
        {e.sat_2_name}
      </div>
    </div>
  );
}

/* ============================================================
   Page
   ============================================================ */
export default function Tracking() {
  const [rawEvents, setRawEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterId, setFilterId] = useState("all");
  const [selectedKey, setSelectedKey] = useState(null);

  // One mount-time fetch — CDMs don't change live and the payload is heavy.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${CDM_API}/fetch`);
        if (!r.ok) throw new Error(r.statusText);
        const data = await r.json();
        if (!cancelled) setRawEvents(data?.cdm_events || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const events = useMemo(() => shapeEvents(rawEvents, filterId), [rawEvents, filterId]);

  // KPI metrics (computed from the unfiltered, deduped active set so the
  // "X total active" headline doesn't change as the user filter-drills).
  const allActive = useMemo(() => shapeEvents(rawEvents, "all"), [rawEvents]);
  const topRisk = allActive[0]; // already sorted by pc desc
  const mostImminent = useMemo(() => {
    const sorted = [...allActive].sort((a, b) => a.tcaMs - b.tcaMs);
    return sorted[0];
  }, [allActive]);

  const chartData = useMemo(() => events.slice(0, 200), [events]); // cap chart for perf
  const tableRows = useMemo(() => events.slice(0, 25), [events]);

  // Selected event detail (hydrate from the deduped set so we don't show a
  // mirrored duplicate row).
  const selected =
    selectedKey != null ? events.find((e) => eventKey(e) === selectedKey) : null;

  return (
    <div className="min-h-screen relative pt-[110px] pb-16 bg-gradient-to-b from-[#050716] via-[#101635] to-[#1B2447] text-white overflow-hidden">
      <SkeletonStyles />
      <div className="absolute inset-0 pointer-events-none">
        <StarField numStars={150} />
      </div>

      <div className="relative max-w-screen-2xl mx-auto px-6 sm:px-12 lg:px-20">
        {/* Hero */}
        <div className="mb-8">
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-teal-300/80 mb-2 flex items-center gap-2">
            <Radar size={12} /> Mission Control
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white">
            Conjunction Risk Dashboard
          </h1>
          <p className="mt-2 text-gray-400 max-w-3xl">
            Live forward-looking view of upcoming close approaches in orbit,
            scored by collision probability. Click a row for details, or
            jump to a satellite's full history via the detail link.
          </p>
        </div>

        {/* KPI strip — skeleton tiles while data is in flight (the CDM
            payload is ~40k rows; first paint takes a few seconds). */}
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
                Icon={Activity}
                label="Active CDMs"
                value={allActive.length.toLocaleString()}
                sub={`from ${rawEvents.length.toLocaleString()} raw events`}
              />
              <KpiTile
                Icon={ShieldAlert}
                label="Top probability"
                value={topRisk ? `${(topRisk.pc * 100).toFixed(3)}%` : "—"}
                sub={topRisk ? `${topRisk.sat_1_name} × ${topRisk.sat_2_name}` : ""}
                accent="text-rose-300"
              />
              <KpiTile
                Icon={AlertTriangle}
                label="Most imminent TCA"
                value={mostImminent ? fmtCountdown(mostImminent.tcaMs) : "—"}
                sub={mostImminent ? fmtUTC(mostImminent.tcaMs) : ""}
                accent="text-amber-300"
              />
              <KpiTile
                Icon={Zap}
                label="Emergency-flagged"
                value={allActive
                  .filter((e) => e.emergency_reportable)
                  .length.toLocaleString()}
                sub="Space-Track flag"
              />
            </>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {FILTERS.map((f) => {
            const isActive = filterId === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilterId(f.id)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors
                            ${
                              isActive
                                ? "bg-teal-500/20 border-teal-400/60 text-teal-100"
                                : "bg-gray-900/60 border-gray-700/60 text-gray-300 hover:bg-gray-800/80 hover:text-white"
                            }`}
              >
                {f.label}
              </button>
            );
          })}
          <span className="ml-auto text-xs text-gray-400 self-center">
            Showing {events.length.toLocaleString()} matching events
          </span>
        </div>

        {/* Risk timeline scatter */}
        <div className="p-4 bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl mb-8">
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-3">
            Risk timeline
          </div>
          {loading ? (
            // Animated chart skeleton — pseudo-random bar heights so it
            // reads as a chart shape, not a flat bar.
            <div className="h-[300px] flex items-end gap-1.5 px-2 pb-6">
              {Array.from({ length: 28 }).map((_, i) => (
                <div
                  key={i}
                  className="relative flex-1 overflow-hidden bg-gray-800/60 rounded-sm"
                  style={{ height: `${20 + ((i * 41) % 75)}%` }}
                >
                  <div
                    className="absolute inset-0 -translate-x-full"
                    style={{
                      animation: "sk-shimmer 1.6s infinite",
                      animationDelay: `${i * 60}ms`,
                      background:
                        "linear-gradient(90deg, transparent, rgba(94,234,212,0.18) 50%, transparent)",
                    }}
                  />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="h-72 flex items-center justify-center text-red-400 text-sm">
              <AlertTriangle size={16} className="mr-2" /> {error}
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-gray-500 text-sm">
              No upcoming events match the current filter.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  type="number"
                  dataKey="tcaMs"
                  name="TCA"
                  stroke="#6b7280"
                  fontSize={11}
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(t) =>
                    new Date(t).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <YAxis
                  type="number"
                  dataKey="pc"
                  name="Pc"
                  stroke="#6b7280"
                  fontSize={11}
                  scale="log"
                  domain={["auto", "auto"]}
                  tickFormatter={(t) => t.toExponential(0)}
                />
                <ZAxis type="number" dataKey="min_rng" range={[40, 220]} name="Miss" />
                <Tooltip content={<ScatterTooltip />} cursor={{ stroke: "#6b7280" }} />
                <Scatter
                  data={chartData}
                  fill="#5EEAD4"
                  shape={(props) => (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={Math.sqrt(props.size) / 1.6}
                      fill={pcColor(props.payload.pc)}
                      fillOpacity={0.55}
                      stroke={pcColor(props.payload.pc)}
                      strokeWidth={1}
                      onClick={() => setSelectedKey(eventKey(props.payload))}
                      style={{ cursor: "pointer" }}
                    />
                  )}
                />
              </ScatterChart>
            </ResponsiveContainer>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-rose-400 mr-1" />{" "}
              Pc ≥ 1e-4
            </span>
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />{" "}
              Pc 1e-5 → 1e-4
            </span>
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-teal-300 mr-1" />{" "}
              Pc &lt; 1e-5
            </span>
            <span className="ml-auto">Bubble size = miss distance (smaller = closer)</span>
          </div>
        </div>

        {/* Top conjunctions table */}
        <div className="bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl overflow-hidden mb-8">
          <div className="p-4 border-b border-gray-700/60 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500">
                Top conjunctions
              </div>
              <div className="text-sm text-gray-300 mt-0.5">
                Highest collision probability, top {tableRows.length}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="cdm-table">
              <thead className="bg-gray-800/50 text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">
                <tr>
                  <th className="text-left px-4 py-2">TCA (UTC)</th>
                  <th className="text-left px-4 py-2">Sat 1</th>
                  <th className="text-left px-4 py-2">Sat 2</th>
                  <th className="text-right px-4 py-2">Miss</th>
                  <th className="text-right px-4 py-2">Pc</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  // 6 skeleton rows so the table doesn't collapse to a thin
                  // strip during the (slow) initial fetch.
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-gray-800/60">
                      <td className="px-4 py-3"><ShimmerBar className="h-3 w-44" /></td>
                      <td className="px-4 py-3">
                        <ShimmerBar className="h-3 w-40 mb-1.5" />
                        <ShimmerBar className="h-2.5 w-28" />
                      </td>
                      <td className="px-4 py-3">
                        <ShimmerBar className="h-3 w-40 mb-1.5" />
                        <ShimmerBar className="h-2.5 w-28" />
                      </td>
                      <td className="px-4 py-3 text-right"><ShimmerBar className="h-3 w-14 ml-auto" /></td>
                      <td className="px-4 py-3 text-right"><ShimmerBar className="h-5 w-20 ml-auto rounded-full" /></td>
                    </tr>
                  ))
                ) : tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-500 py-8">
                      No events match the current filter.
                    </td>
                  </tr>
                ) : (
                  tableRows.map((e) => {
                    const k = eventKey(e);
                    const isSel = selectedKey === k;
                    return (
                      <tr
                        key={k}
                        data-testid="cdm-row"
                        onClick={() => setSelectedKey(k)}
                        className={`cursor-pointer border-t border-gray-800/60
                                    transition-colors
                                    ${
                                      isSel
                                        ? "bg-teal-500/10"
                                        : "hover:bg-gray-800/40"
                                    }`}
                      >
                        <td className="px-4 py-2 text-gray-300 font-mono text-xs">
                          {fmtUTC(e.tcaMs)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-gray-100 truncate max-w-[14rem]">
                            {e.sat_1_name}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            #{e.sat_1_id} · {e.sat_1_type} · {e.sat_1_rcs}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-gray-100 truncate max-w-[14rem]">
                            {e.sat_2_name}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            #{e.sat_2_id} · {e.sat_2_type} · {e.sat_2_rcs}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-gray-300 font-mono">
                          {e.min_rng} km
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span
                            className="inline-flex items-center justify-end px-2 py-0.5 rounded-full text-[11px] font-mono border"
                            style={{
                              color: pcColor(e.pc),
                              borderColor: `${pcColor(e.pc)}66`,
                              background: `${pcColor(e.pc)}1a`,
                            }}
                          >
                            {(e.pc * 100).toFixed(4)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-event detail panel */}
        <div
          data-testid="cdm-detail"
          className="p-5 bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl mb-12"
        >
          {!selected ? (
            <div className="text-center text-gray-500 text-sm py-8">
              Select a conjunction in the table above to inspect details.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-1">
                  Time of closest approach
                </div>
                <div className="text-lg text-gray-100">
                  {fmtUTC(selected.tcaMs)}
                </div>
                <div className="text-xs text-amber-300 mt-1">
                  {fmtCountdown(selected.tcaMs)} from now
                </div>
                <div className="mt-4 text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-1">
                  Collision probability
                </div>
                <div
                  className="text-2xl font-semibold"
                  style={{ color: pcColor(selected.pc) }}
                >
                  {(selected.pc * 100).toFixed(4)}%
                </div>
                <div className="mt-4 text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-1">
                  Miss distance
                </div>
                <div className="text-lg text-gray-100">{selected.min_rng} km</div>
                {selected.emergency_reportable ? (
                  <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-rose-200 bg-rose-500/15 border border-rose-500/30 rounded-full px-2 py-0.5">
                    <AlertTriangle size={12} /> Emergency reportable
                  </div>
                ) : null}
              </div>

              {[1, 2].map((side) => {
                const id = selected[`sat_${side}_id`];
                const name = selected[`sat_${side}_name`];
                return (
                  <div key={side}>
                    <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-1">
                      Object {side}
                    </div>
                    <div className="text-lg text-gray-100 truncate flex items-center gap-2">
                      <SatIcon size={16} className="text-teal-300 shrink-0" />
                      {name}
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs">
                      <dt className="text-gray-500">NORAD</dt>
                      <dd className="text-gray-200 font-mono">#{id}</dd>
                      <dt className="text-gray-500">Type</dt>
                      <dd className="text-gray-200">
                        {selected[`sat_${side}_type`]}
                      </dd>
                      <dt className="text-gray-500">RCS</dt>
                      <dd className="text-gray-200">
                        {selected[`sat_${side}_rcs`]}
                      </dd>
                      <dt className="text-gray-500">Excl. volume</dt>
                      <dd className="text-gray-200">
                        {selected[`sat_${side}_excl_vol`]}
                      </dd>
                    </dl>
                    <div className="mt-3 text-xs">
                      <Link
                        to={`/satellites/${encodeURIComponent(name)}`}
                        className="inline-flex items-center gap-1 text-teal-300 hover:text-teal-200"
                      >
                        Detail + TLE history <ArrowRight size={12} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer attribution */}
        <div className="mt-12 text-center text-xs text-gray-500">
          Data: Space-Track CDM events <ExternalLink size={10} className="inline" /> ·
          NORAD TLE history · all updates every 15 minutes.
        </div>
      </div>
    </div>
  );
}
