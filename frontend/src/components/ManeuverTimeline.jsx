// ManeuverTimeline — detected orbital events for a satellite, plus an
// AI-generated narrative describing the operational pattern.
import { useEffect, useState } from "react";
import { Sparkles, Loader2, Activity } from "lucide-react";
import { fetchSatelliteTimeline } from "../api/satelliteService";
import RichText from "./RichText";

const CLASSIFICATION_COLORS = {
  "orbit raise": "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  "orbit lower": "text-amber-300 border-amber-500/30 bg-amber-500/10",
  "perigee raise": "text-emerald-200 border-emerald-500/30 bg-emerald-500/10",
  "apogee raise": "text-emerald-200 border-emerald-500/30 bg-emerald-500/10",
  "perigee lower": "text-amber-200 border-amber-500/30 bg-amber-500/10",
  "apogee lower": "text-amber-200 border-amber-500/30 bg-amber-500/10",
  "inclination change": "text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10",
  "trim maneuver": "text-sky-300 border-sky-500/30 bg-sky-500/10",
};

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

export default function ManeuverTimeline({ norad, satelliteName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!norad) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSatelliteTimeline(norad, 365).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res?.error) {
        setError(res.message || "Could not load timeline.");
      } else {
        setData(res);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [norad]);

  return (
    <div className="bg-gray-900/60 backdrop-blur-xl border border-teal-500/30 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-teal-300" />
          <span className="text-[12px] font-mono uppercase tracking-[0.2em] text-teal-200">
            AI Maneuver Timeline
          </span>
        </div>
        {data?.events && (
          <span className="text-[10px] font-mono text-gray-500">
            {data.events.length} event{data.events.length === 1 ? "" : "s"} · 365d
          </span>
        )}
      </div>

      <div className="p-4">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 size={12} className="animate-spin" />
            Analyzing 365 days of TLE history…
          </div>
        )}

        {error && (
          <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1.5">
            {error}
          </div>
        )}

        {data && !error && (
          <>
            <RichText className="text-sm text-gray-100 mb-4">{data.narrative}</RichText>

            {data.events.length > 0 ? (
              <div className="space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                  Detected events
                </div>
                {data.events.map((e, i) => {
                  const cls =
                    CLASSIFICATION_COLORS[e.classification] ||
                    "text-gray-300 border-gray-700 bg-gray-800/40";
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border ${cls}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Activity size={12} />
                        <span className="text-[11px] font-mono whitespace-nowrap">
                          {fmtDate(e.start)} → {fmtDate(e.end)}
                        </span>
                        <span className="text-xs font-medium capitalize truncate">
                          {e.classification}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-right shrink-0">
                        Δperi {e.delta_perigee_km > 0 ? "+" : ""}{e.delta_perigee_km}km
                        {" · "}
                        Δapo {e.delta_apogee_km > 0 ? "+" : ""}{e.delta_apogee_km}km
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-gray-500 italic">
                No significant maneuvers detected in the last 365 days. The satellite is either
                drag-driven only, or hasn&apos;t accumulated enough TLE history yet.
              </div>
            )}

            <div className="mt-3 pt-2 border-t border-gray-800/60 text-[10px] text-gray-500">
              Detected from {data.snapshots?.length || 0} TLE snapshots
            </div>
          </>
        )}
      </div>
    </div>
  );
}
