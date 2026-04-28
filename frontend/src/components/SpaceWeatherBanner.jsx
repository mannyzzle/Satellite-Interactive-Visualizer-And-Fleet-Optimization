// SpaceWeatherBanner — top-of-page banner that lights up when geomagnetic
// activity is elevated. Clicking opens an AI briefing.
import { useEffect, useState } from "react";
import { Zap, Sparkles, X, Loader2 } from "lucide-react";
import { fetchSpaceWeather, fetchSpaceWeatherBriefing } from "../api/satelliteService";

const LEVEL_STYLES = {
  "severe storm": "from-rose-600/30 to-rose-500/10 border-rose-500/50 text-rose-100",
  "strong storm": "from-rose-500/30 to-amber-500/10 border-rose-400/40 text-rose-100",
  "minor storm": "from-amber-500/30 to-amber-400/10 border-amber-500/40 text-amber-100",
  "unsettled": "from-sky-500/20 to-teal-500/10 border-sky-500/40 text-sky-100",
  "quiet": "from-emerald-500/10 to-transparent border-emerald-500/20 text-emerald-200",
  "unknown": "from-gray-700/30 to-transparent border-gray-700 text-gray-300",
};

export default function SpaceWeatherBanner() {
  const [weather, setWeather] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSpaceWeather().then((w) => {
      if (!cancelled) setWeather(w);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!weather) return null;
  const level = weather.storm?.level || "unknown";
  const isActive = weather.storm?.active;
  // Only render the banner when there's something noteworthy
  if (level === "quiet" || level === "unknown") return null;
  const style = LEVEL_STYLES[level] || LEVEL_STYLES.unknown;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`w-full bg-gradient-to-r ${style} border-b backdrop-blur-md
                    px-4 py-2 text-sm flex items-center justify-center gap-2
                    hover:brightness-110 transition-all`}
      >
        <Zap size={14} className={isActive ? "animate-pulse" : ""} />
        <span className="font-medium uppercase text-[11px] tracking-wider">
          {level}
        </span>
        <span className="text-xs opacity-80">
          Kp {weather.kp?.toFixed(1) ?? "—"} · Dst {weather.dst?.toFixed(0) ?? "—"} nT
        </span>
        <span className="hidden sm:inline text-[10px] opacity-70 ml-2">
          tap for AI briefing →
        </span>
      </button>
      {open && <SpaceWeatherModal weather={weather} onClose={() => setOpen(false)} />}
    </>
  );
}

function SpaceWeatherModal({ weather, onClose }) {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchSpaceWeatherBriefing().then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res?.error) setError(res.message);
      else setBriefing(res);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-teal-300" />
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-teal-300 mb-0.5">
                Space Weather Briefing
              </div>
              <div className="text-base font-semibold text-white capitalize">
                {weather.storm?.level || "—"}
              </div>
              <div className="text-xs text-gray-400 font-mono">
                Kp {weather.kp ?? "—"} · Dst {weather.dst ?? "—"} nT · F10.7 {weather.f107 ?? "—"} sfu
              </div>
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
              <div className="text-sm text-gray-100 leading-relaxed whitespace-pre-line">
                {briefing.briefing}
              </div>
              {weather.most_exposed_leo?.length > 0 && (
                <div className="mt-4">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-2">
                    Most-exposed LEO
                  </div>
                  <div className="space-y-1">
                    {weather.most_exposed_leo.map((s) => (
                      <div
                        key={s.norad_number}
                        className="flex items-center justify-between text-xs px-2 py-1.5 bg-gray-900/60 rounded border border-gray-800"
                      >
                        <span className="text-gray-200 truncate">{s.name}</span>
                        <span className="text-gray-500 font-mono whitespace-nowrap">
                          {s.perigee_km?.toFixed(0)}km · B* {s.bstar?.toExponential(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
