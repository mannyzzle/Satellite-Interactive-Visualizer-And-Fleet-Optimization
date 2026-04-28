// Reentry Watch — leaderboard of LEO objects most imminent to decay.
// Click a row → AI briefing modal.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Loader2, Sparkles, X, ArrowRight, AlertTriangle, ChevronDown } from "lucide-react";
import { StarField } from "../components/StarField";
import { SkeletonStyles, ShimmerBar } from "../components/Skeleton";
import { KpiTile, KpiSkeleton } from "../components/KpiTile";
import { fetchUpcomingReentries, fetchReentryBriefing } from "../api/satelliteService";
import { getCountryFlag, getCountryName } from "../lib/countries";
import RichText from "../components/RichText";

const RISK_PILL = {
  elevated: "bg-rose-500/20 border-rose-500/40 text-rose-200",
  moderate: "bg-amber-500/20 border-amber-500/40 text-amber-200",
  low: "bg-sky-500/20 border-sky-500/40 text-sky-200",
  unknown: "bg-gray-700/40 border-gray-600 text-gray-300",
};

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

  return (
    <div className="min-h-screen relative pt-[110px] pb-16 bg-gradient-to-b from-[#050716] via-[#101635] to-[#1B2447] text-white">
      <SkeletonStyles />
      <div className="absolute inset-0 pointer-events-none">
        <StarField numStars={140} />
      </div>

      <div className="relative max-w-screen-2xl mx-auto px-6 sm:px-12 lg:px-20">
        {/* Hero */}
        <div className="mb-8">
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80 mb-2 flex items-center gap-2">
            <Flame size={12} /> Reentry Watch
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white">
            Most-Exposed LEO Objects
          </h1>
          <p className="mt-2 text-gray-400 max-w-3xl">
            Active LEO objects ranked by drag imminence — lowest perigees combined with the
            highest ballistic coefficients. These are the satellites and debris pieces with the
            shortest remaining orbital lifetime in our catalog. Click any row for an AI risk briefing.
          </p>
        </div>

        {/* KPI strip */}
        <div className="flex flex-wrap gap-3 mb-8">
          {loading ? (
            <>
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
                sub="active LEO objects"
                accent="text-amber-300"
              />
              <KpiTile
                Icon={AlertTriangle}
                label="Elevated fragment risk"
                value={elevated.length.toLocaleString()}
                sub="LARGE-RCS objects"
                accent="text-rose-300"
              />
              <KpiTile
                Icon={ArrowRight}
                label="Lowest perigee"
                value={lowestPerigee ? `${lowestPerigee.perigee_km.toFixed(0)} km` : "—"}
                sub={lowestPerigee?.name || ""}
              />
            </>
          )}
        </div>

        {/* Table */}
        <div className="bg-gray-900/60 backdrop-blur-xl border border-gray-700/60 rounded-xl overflow-hidden mb-12">
          {loading ? (
            <div className="p-8">
              <ShimmerBar />
            </div>
          ) : reentries.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No imminent reentries detected.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/40 text-gray-400 text-[10px] font-mono uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3">#</th>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Country</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-right px-4 py-3">Perigee</th>
                    <th className="text-right px-4 py-3">B*</th>
                    <th className="text-left px-4 py-3">Inclination</th>
                    <th className="text-left px-4 py-3">Risk</th>
                    <th className="text-right px-4 py-3">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {reentries.map((r, i) => (
                    <tr
                      key={r.norad_number}
                      onClick={() => setSelected(r)}
                      className="border-t border-gray-800/60 hover:bg-teal-500/5 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5 text-gray-100 truncate max-w-xs">{r.name}</td>
                      <td className="px-4 py-2.5 text-gray-300 text-xs">
                        {r.country ? `${getCountryFlag(r.country)} ${r.country}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{r.object_type || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-amber-200">
                        {r.perigee_km != null ? `${r.perigee_km.toFixed(0)}km` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-300 text-xs">
                        {r.bstar != null ? r.bstar.toExponential(2) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-300 text-xs">
                        {r.inclination_deg != null
                          ? `${r.inclination_deg.toFixed(1)}° · ${r.inclination_band}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                            RISK_PILL[r.fragment_risk] || RISK_PILL.unknown
                          }`}
                        >
                          {r.fragment_risk}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-teal-300 text-xs">
                        {r.imminence_score?.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="text-xs text-gray-500 text-center mb-4">
          Imminence score = bstar / perigee × 1e4. Heuristic only — not a decay-date prediction.
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
    fetchReentryBriefing(reentry.norad_number).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res?.error) setError(res.message);
      else setBriefing(res);
    });
    return () => {
      cancelled = true;
    };
  }, [reentry.norad_number]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-950 border border-teal-500/40 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800/80">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-teal-300 mb-1 flex items-center gap-1">
              <Sparkles size={11} /> AI Reentry Briefing
            </div>
            <div className="text-lg font-semibold text-white">{reentry.name}</div>
            <div className="text-xs text-gray-400">
              #{reentry.norad_number} · {reentry.country || "—"} · perigee {reentry.perigee_km?.toFixed(0)}km
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-800 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              Generating briefing…
            </div>
          )}
          {error && <div className="text-sm text-rose-300">{error}</div>}
          {briefing && (
            <>
              <RichText className="text-sm text-gray-100">{briefing.briefing}</RichText>
              <div className="mt-4 pt-3 border-t border-gray-800/60 flex items-center justify-between text-[10px] text-gray-500">
                <span>{briefing.disclaimer}</span>
                <Link
                  to={`/satellites/${encodeURIComponent(reentry.name)}`}
                  className="inline-flex items-center gap-1 text-teal-300 hover:text-teal-200"
                  onClick={onClose}
                >
                  Detail + TLE history <ArrowRight size={11} />
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
