// NLSearchBar — natural-language satellite search.
// On submit, calls /api/llm/search and shows a results panel. Selecting a
// result fires onSelectSatellite(sat) so the parent decides what "open" means
// (focus on globe vs navigate to detail page).
import { useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import { searchByNL } from "../api/satelliteService";

const FILTER_LABELS = {
  orbit_type: "Orbit",
  purpose: "Purpose",
  country: "Country",
  launch_year_min: "Year ≥",
  launch_year_max: "Year ≤",
  perigee_min_km: "Perigee ≥",
  perigee_max_km: "Perigee ≤",
  apogee_min_km: "Apogee ≥",
  apogee_max_km: "Apogee ≤",
  velocity_min: "Velocity ≥",
  velocity_max: "Velocity ≤",
  eccentricity_min: "Ecc ≥",
  active_only: "Active payloads",
  recent_launches: "Last 30 days",
  decaying: "Decaying",
};

function describeFilters(filters) {
  if (!filters) return [];
  return Object.entries(filters)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => {
      const label = FILTER_LABELS[k] || k;
      if (typeof v === "boolean") return label;
      return `${label}: ${v}`;
    });
}

export default function NLSearchBar({ onSelectSatellite, placeholder, className = "" }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function submit(e) {
    e?.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const data = await searchByNL(query.trim(), 100);
    setLoading(false);
    if (data?.error) {
      setError(data.message || "Search failed.");
      return;
    }
    setResult(data);
  }

  function clearAll() {
    setQuery("");
    setResult(null);
    setError(null);
  }

  const filterChips = describeFilters(result?.filters);

  return (
    <div className={`w-full ${className}`}>
      <form
        onSubmit={submit}
        className="flex items-center gap-2 bg-gray-900/70 border border-teal-500/30 rounded-lg px-3 py-2 focus-within:border-teal-400/70 transition-colors"
      >
        <Sparkles size={16} className="text-teal-300 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder || "Ask the catalog: \"Chinese GEO comms launched after 2020\""}
          className="flex-1 bg-transparent outline-none text-sm text-gray-100 placeholder:text-gray-500"
          maxLength={500}
        />
        {query && !loading && (
          <button type="button" onClick={clearAll} className="text-gray-500 hover:text-gray-300">
            <X size={14} />
          </button>
        )}
        <button
          type="submit"
          disabled={!query.trim() || loading}
          className="text-[11px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : null}
          Ask
        </button>
      </form>

      {error && (
        <div className="mt-2 text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-2 bg-gray-900/70 border border-gray-700/60 rounded-lg p-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-1">
            Interpreted as
          </div>
          {filterChips.length === 0 ? (
            <div className="text-[11px] text-gray-400 italic">
              No structured filters extracted — showing the full catalog. Try being more specific.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {filterChips.map((chip) => (
                <span
                  key={chip}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-500/15 border border-teal-500/30 text-teal-200"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 text-[11px] text-gray-400">
            {result.total.toLocaleString()} match{result.total === 1 ? "" : "es"}
            {result.satellites?.length < result.total
              ? ` (showing first ${result.satellites.length})`
              : ""}
          </div>

          {result.satellites?.length > 0 && (
            <div className="mt-2 max-h-64 overflow-y-auto divide-y divide-gray-800/60">
              {result.satellites.slice(0, 100).map((sat) => (
                <button
                  type="button"
                  key={sat.norad_number}
                  onClick={() => onSelectSatellite?.(sat)}
                  className="w-full text-left px-2 py-1.5 hover:bg-teal-500/10 rounded text-xs text-gray-200 flex items-center justify-between gap-2"
                >
                  <span className="truncate">{sat.name}</span>
                  <span className="text-[10px] font-mono text-gray-500">
                    #{sat.norad_number} · {sat.orbit_type || "—"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
