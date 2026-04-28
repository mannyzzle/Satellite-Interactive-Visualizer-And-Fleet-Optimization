// Reentry Watch — leaderboard of LEO objects most imminent to decay,
// with an AI risk briefing modal per row.
//
// Visual goals:
//   • Cinematic flame-tinted hero so the page reads as "high-risk corner"
//     without screaming.
//   • Row-level imminence visualized as a horizontal bar so users can see
//     the score distribution at a glance, not just numbers.
//   • Pulsing risk dots (elevated/moderate) — same idiom as the catalog +
//     status pills elsewhere.
//   • Briefing modal: hero with status pill, parameter grid (perigee /
//     B* / inclination / score), then RichText narrative, deep link out.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  ChevronDown,
  Flame,
  Loader2,
  Orbit,
  Satellite as SatIcon,
  Sparkles,
  TrendingDown,
  X,
} from "lucide-react";
import { StarField } from "../components/StarField";
import { SkeletonStyles, ShimmerBar } from "../components/Skeleton";
import { KpiTile, KpiSkeleton } from "../components/KpiTile";
import { fetchUpcomingReentries, fetchReentryBriefing } from "../api/satelliteService";
import { getCountryFlag, getCountryName } from "../lib/countries";
import RichText from "../components/RichText";

const RISK_INFO = {
  elevated: {
    pill: "bg-rose-500/20 border-rose-500/40 text-rose-200",
    dot: "bg-rose-400",
    pulse: true,
    bar: "from-rose-400/80 via-rose-500/60 to-rose-300/40",
    label: "Elevated",
  },
  moderate: {
    pill: "bg-amber-500/20 border-amber-500/40 text-amber-200",
    dot: "bg-amber-400",
    pulse: true,
    bar: "from-amber-400/80 via-amber-500/60 to-amber-300/40",
    label: "Moderate",
  },
  low: {
    pill: "bg-sky-500/20 border-sky-500/40 text-sky-200",
    dot: "bg-sky-400",
    pulse: false,
    bar: "from-sky-400/70 via-sky-500/50 to-sky-300/30",
    label: "Low",
  },
  unknown: {
    pill: "bg-gray-700/40 border-gray-600 text-gray-300",
    dot: "bg-gray-400",
    pulse: false,
    bar: "from-gray-500/60 via-gray-500/40 to-gray-400/20",
    label: "Unknown",
  },
};
const riskInfo = (k) => RISK_INFO[k] || RISK_INFO.unknown;

export default function Reentry() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchUpcomingReentries(25).then((d) => {
      if (cancelled) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reentries = data?.reentries || [];
  const elevated = reentries.filter((r) => r.fragment_risk === "elevated");
  const lowestPerigee = reentries[0];

  // Max imminence in the visible set — used to scale the per-row bars
  // so the highest-risk object reads as 100% width.
  const maxScore = useMemo(
    () => reentries.reduce((m, r) => Math.max(m, r.imminence_score || 0), 0),
    [reentries]
  );

  return (
    <div className="min-h-screen relative pt-[110px] pb-16 bg-gradient-to-b from-[#1a0709] via-[#0c0815] to-[#050716] text-white overflow-hidden">
      <SkeletonStyles />
      <style>{`
        @keyframes rt-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rt-flame {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%      { opacity: 0.85; transform: scale(1.1); }
        }
      `}</style>

      <div className="absolute inset-0 pointer-events-none">
        <StarField numStars={120} />
      </div>

      {/* Decorative flame/heat smear behind the hero — pure CSS, no GPU. */}
      <div
        className="absolute top-[60px] left-1/2 -translate-x-1/2 w-[80vw] max-w-[800px] h-[260px] pointer-events-none rounded-full blur-3xl opacity-40"
        style={{
          background:
            "radial-gradient(closest-side, rgba(244,63,94,0.45), rgba(251,146,60,0.25), transparent 70%)",
          animation: "rt-flame 6s ease-in-out infinite",
        }}
      />

      <div className="relative max-w-screen-2xl mx-auto px-6 sm:px-12 lg:px-20">
        {/* Hero */}
        <div className="mb-10">
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80 mb-3 flex items-center gap-2">
            <Flame size={12} /> Reentry Watch
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-rose-200 to-amber-100">
            Most-exposed LEO objects
          </h1>
          <p className="mt-3 text-gray-300 text-base sm:text-lg leading-relaxed max-w-3xl">
            Active LEO objects ranked by drag imminence — lowest perigees combined with the
            highest ballistic coefficients. These are the satellites and rocket bodies with
            the shortest remaining orbital lifetime in our catalog.
          </p>
          <p className="mt-2 text-gray-500 text-sm">
            Click any row for an AI risk briefing.
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
                Icon={Flame}
                label="Tracked imminent"
                value={(data?.count ?? 0).toLocaleString()}
                sub="Active LEO objects scored"
                accent="text-amber-300"
              />
              <KpiTile
                Icon={AlertTriangle}
                label="Elevated risk"
                value={elevated.length.toLocaleString()}
                sub="Large RCS · debris-shedding likely"
                accent="text-rose-300"
              />
              <KpiTile
                Icon={TrendingDown}
                label="Lowest perigee"
                value={lowestPerigee ? `${lowestPerigee.perigee_km.toFixed(0)} km` : "—"}
                sub={lowestPerigee?.name || ""}
                accent="text-amber-200"
              />
              <KpiTile
                Icon={Orbit}
                label="Median inclination"
                value={
                  reentries.length
                    ? `${(
                        reentries
                          .map((r) => r.inclination_deg || 0)
                          .sort((a, b) => a - b)[Math.floor(reentries.length / 2)]
                      ).toFixed(1)}°`
                    : "—"
                }
                sub="Across the leaderboard"
                accent="text-cyan-300"
              />
            </>
          )}
        </div>

        {/* Leaderboard table */}
        <div className="bg-gray-900/70 backdrop-blur-xl border border-gray-700/60 rounded-xl overflow-hidden mb-8 relative">
          {/* Subtle top accent bar matching the page tone */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-rose-400/40 to-transparent" />

          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ShimmerBar key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : reentries.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              No imminent reentries detected.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/40 text-gray-400 text-[10px] font-mono uppercase tracking-[0.2em]">
                  <tr>
                    <th className="text-left px-4 py-3 w-12">#</th>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Country</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-right px-4 py-3">Perigee</th>
                    <th className="text-right px-4 py-3">B*</th>
                    <th className="text-left px-4 py-3">Inclination</th>
                    <th className="text-left px-4 py-3 w-44">Imminence</th>
                    <th className="text-left px-4 py-3">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {reentries.map((r, i) => {
                    const ri = riskInfo(r.fragment_risk);
                    const pct = maxScore > 0 ? ((r.imminence_score || 0) / maxScore) * 100 : 0;
                    return (
                      <tr
                        key={r.norad_number}
                        onClick={() => setSelected(r)}
                        style={{
                          animation: "rt-fade-in 320ms ease-out both",
                          animationDelay: `${Math.min(i, 12) * 22}ms`,
                        }}
                        className="group border-t border-gray-800/60 hover:bg-rose-500/5 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">
                          {String(i + 1).padStart(2, "0")}
                        </td>
                        <td className="px-4 py-2.5 text-gray-100 font-medium truncate max-w-xs group-hover:text-rose-100 transition-colors">
                          {r.name}
                        </td>
                        <td className="px-4 py-2.5 text-gray-300">
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <span className="text-base leading-none">
                              {getCountryFlag(r.country)}
                            </span>
                            <span className="text-xs font-mono text-gray-400">
                              {r.country || "—"}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">
                          {r.object_type || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-amber-200">
                          {r.perigee_km != null ? `${r.perigee_km.toFixed(0)} km` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-300 text-xs">
                          {r.bstar != null ? r.bstar.toExponential(2) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 text-xs">
                          {r.inclination_deg != null ? (
                            <>
                              {r.inclination_deg.toFixed(1)}°
                              <span className="text-gray-500"> · {r.inclination_band}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-800/80 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full bg-gradient-to-r ${ri.bar}`}
                                style={{ width: `${pct.toFixed(1)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-gray-400 w-10 text-right">
                              {(r.imminence_score ?? 0).toFixed(2)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${ri.pill}`}
                          >
                            <span className="relative flex w-1.5 h-1.5">
                              {ri.pulse ? (
                                <span
                                  className={`absolute inset-0 rounded-full ${ri.dot} opacity-70 animate-ping`}
                                />
                              ) : null}
                              <span className={`relative w-1.5 h-1.5 rounded-full ${ri.dot}`} />
                            </span>
                            {ri.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Methodology footnote */}
        <div className="text-xs text-gray-500 leading-relaxed max-w-3xl">
          <span className="text-gray-400 font-mono">Imminence</span> = B* / perigee × 1e4 — a
          coarse heuristic, not a decay-date prediction. Objects with{" "}
          <span className="text-rose-300">elevated</span> tags are LARGE-RCS bodies likely to
          shed fragments during reentry; consult Space-Track CDM feeds for operational decisions.
        </div>
      </div>

      {selected && (
        <ReentryBriefingModal reentry={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function ReentryBriefingModal({ reentry, onClose }) {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBriefing(null);
    fetchReentryBriefing(reentry.norad_number).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res?.error) setError(res.message || "Briefing unavailable.");
      else setBriefing(res);
    });
    return () => {
      cancelled = true;
    };
  }, [reentry.norad_number]);

  // ESC closes the modal — standard pattern.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ri = riskInfo(reentry.fragment_risk);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-950 border border-rose-500/30 rounded-xl w-full max-w-3xl max-h-[88vh] overflow-y-auto
                   shadow-[0_0_60px_-10px_rgba(244,63,94,0.4)]"
      >
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-gray-800/80">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-rose-400/50 to-transparent" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-rose-300/90 mb-2 flex items-center gap-1.5">
                <Sparkles size={11} /> AI Reentry Briefing
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold text-white truncate flex items-center gap-2">
                <SatIcon size={18} className="text-rose-300 shrink-0" />
                {reentry.name}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                <span className="font-mono">#{reentry.norad_number}</span>
                <span className="text-gray-600">·</span>
                <span className="inline-flex items-center gap-1">
                  <span className="text-base leading-none">{getCountryFlag(reentry.country)}</span>
                  {getCountryName(reentry.country)}
                </span>
                {reentry.object_type ? (
                  <>
                    <span className="text-gray-600">·</span>
                    <span>{reentry.object_type}</span>
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span
                className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase px-2 py-1 rounded-full border ${ri.pill}`}
              >
                <span className="relative flex w-1.5 h-1.5">
                  {ri.pulse ? (
                    <span className={`absolute inset-0 rounded-full ${ri.dot} opacity-70 animate-ping`} />
                  ) : null}
                  <span className={`relative w-1.5 h-1.5 rounded-full ${ri.dot}`} />
                </span>
                {ri.label}
              </span>
              <button
                onClick={onClose}
                aria-label="Close (ESC)"
                title="Close (ESC)"
                className="ml-2 p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Parameter strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-800/60 border-b border-gray-800/80">
          {[
            {
              label: "Perigee",
              value: reentry.perigee_km != null ? `${reentry.perigee_km.toFixed(0)} km` : "—",
              accent: "text-amber-200",
            },
            {
              label: "B* drag",
              value: reentry.bstar != null ? reentry.bstar.toExponential(2) : "—",
              accent: "text-gray-200",
            },
            {
              label: "Inclination",
              value:
                reentry.inclination_deg != null
                  ? `${reentry.inclination_deg.toFixed(1)}°`
                  : "—",
              accent: "text-cyan-300",
            },
            {
              label: "Imminence",
              value:
                reentry.imminence_score != null
                  ? reentry.imminence_score.toFixed(2)
                  : "—",
              accent: "text-rose-300",
            },
          ].map((c) => (
            <div key={c.label} className="bg-gray-950 px-4 py-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500">
                {c.label}
              </div>
              <div className={`mt-1 text-lg font-semibold font-mono ${c.accent}`}>
                {c.value}
              </div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin text-rose-300" />
              Generating briefing…
            </div>
          )}
          {error && (
            <div className="text-sm text-rose-300 inline-flex items-center gap-2">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {briefing && (
            <>
              <RichText className="text-sm text-gray-100">{briefing.briefing}</RichText>
              <div className="mt-5 pt-3 border-t border-gray-800/60 flex items-center justify-between gap-3 flex-wrap">
                {briefing.disclaimer ? (
                  <span className="text-[10px] text-gray-500 italic">
                    {briefing.disclaimer}
                  </span>
                ) : (
                  <span />
                )}
                <Link
                  to={`/satellites/${encodeURIComponent(reentry.name)}`}
                  className="inline-flex items-center gap-1.5 text-xs text-rose-300 hover:text-rose-200 font-medium"
                  onClick={onClose}
                >
                  Open full detail + TLE history
                  <ArrowRight size={12} />
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
