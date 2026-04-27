// Satellite catalog browser. Single filterable + paginated table replacing
// the old 21-section paginated-grid layout. Filters: orbit type, object
// type, plus a name-or-NORAD search that hits /api/satellites/suggest and
// navigates straight to the detail page on pick. URL query params keep
// filter + page state so deep links work.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter as FilterIcon,
  Orbit,
  RotateCcw,
  Satellite as SatIcon,
  Search,
  X,
} from "lucide-react";
import { fetchSatellites } from "../api/satelliteService";
import { SATELLITES_API } from "../config";
import { StarField } from "../components/StarField";
import { ShimmerBar, SkeletonStyles } from "../components/Skeleton";
import NLSearchBar from "../components/NLSearchBar";
import { getCountryFlag, getCountryName } from "../lib/countries";

const PAGE_SIZE = 50;

// Color-coded orbit dot. Reads at a glance — no need to scan the orbit
// column for the four-letter code.
const ORBIT_DOT = {
  LEO: "bg-cyan-400",
  MEO: "bg-teal-400",
  GEO: "bg-violet-400",
  HEO: "bg-amber-400",
};

// Filter pill option lists. The label is what the backend's filter param
// expects — Home/Tracking already use the same vocabulary.
const ORBIT_OPTIONS = [
  { id: "", label: "All", range: "" },
  { id: "LEO", label: "LEO", range: "160 – 2,000 km" },
  { id: "MEO", label: "MEO", range: "2,000 – 35,786 km" },
  { id: "GEO", label: "GEO", range: "≈ 35,786 km" },
  { id: "HEO", label: "HEO", range: "Highly elliptical" },
];

const TYPE_OPTIONS = [
  { id: "", label: "All" },
  { id: "PAYLOAD", label: "Payload" },
  { id: "DEBRIS", label: "Debris" },
  { id: "ROCKET BODY", label: "Rocket body" },
  { id: "UNKNOWN", label: "Unknown" },
];

const STATUS_PILL = {
  Active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Decaying: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Inactive: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

function statusClasses(status) {
  return STATUS_PILL[status] || STATUS_PILL.Inactive;
}

function buildFilterParam(orbit, type) {
  const parts = [];
  if (orbit) parts.push(orbit);
  if (type) parts.push(type);
  return parts.join(",");
}

export default function SatelliteList() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const orbit = params.get("orbit") || "";
  const type = params.get("type") || "";
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  // `loading` = first paint (show full skeleton). `refreshing` = subsequent
  // filter/page changes — keep stale rows visible to avoid flicker, just
  // dim them and show a top progress bar. Big perceived-speed improvement.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Search input + suggestions — pick a result to jump straight to detail.
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Server fetch driven by filter/page state. First load shows skeletons;
  // subsequent re-fetches keep the previous rows on screen (dimmed) so the
  // page doesn't flash empty between filter changes.
  useEffect(() => {
    let cancelled = false;
    if (rows.length === 0) setLoading(true);
    else setRefreshing(true);
    setError(null);
    const filt = buildFilterParam(orbit, type) || null;
    fetchSatellites(page, PAGE_SIZE, filt)
      .then((data) => {
        if (cancelled) return;
        setRows(data?.satellites || []);
        setTotal(data?.total || 0);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Failed to load catalog");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orbit, type, page]);

  // Suggestions — debounced 250ms.
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `${SATELLITES_API}/suggest?query=${encodeURIComponent(query)}&limit=8`
        );
        if (!r.ok) throw new Error(r.statusText);
        const { suggestions = [] } = await r.json();
        setSuggestions(suggestions);
        setHighlightedIdx(-1);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Outside-click closes the suggestions dropdown.
  useEffect(() => {
    if (suggestions.length === 0) return;
    const onDown = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        inputRef.current &&
        !inputRef.current.contains(e.target)
      ) {
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [suggestions]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set("page", "1"); // reset paging on filter change
    setParams(next);
  }
  function setPage(p) {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    setParams(next);
  }
  function resetFilters() {
    setParams(new URLSearchParams());
  }

  function pickSuggestion(s) {
    setSuggestions([]);
    setQuery("");
    navigate(`/satellites/${encodeURIComponent(s.name)}`);
  }

  return (
    <div className="min-h-screen relative pt-[110px] pb-16 bg-gradient-to-b from-[#050716] via-[#101635] to-[#1B2447] text-white overflow-hidden">
      <SkeletonStyles />
      <style>{`
        @keyframes tk-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes tk-progress {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
      {/* Top-of-page progress bar — visible during filter/page re-fetches
          so the user knows something is happening, without blanking the
          table. Hidden when idle (no layout shift). */}
      <div
        className={`fixed top-[70px] left-0 right-0 h-0.5 z-30 overflow-hidden transition-opacity ${
          refreshing ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div
          className="h-full w-1/4 bg-gradient-to-r from-transparent via-teal-300 to-transparent"
          style={{ animation: "tk-progress 1.4s ease-in-out infinite" }}
        />
      </div>
      <div className="absolute inset-0 pointer-events-none">
        <StarField numStars={150} />
      </div>

      <div className="relative max-w-screen-2xl mx-auto px-6 sm:px-12 lg:px-20">
        {/* Hero */}
        <div className="mb-8">
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-teal-300/80 mb-2 flex items-center gap-2">
            <SatIcon size={12} /> Catalog
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white">
            Satellite Catalog
          </h1>
          <p className="mt-2 text-gray-400 max-w-3xl">
            Filter the live fleet by orbit type and object class. Click any
            row to inspect a satellite's orbit profile, TLE history, and
            neighbors in similar orbits.
          </p>
        </div>

        {/* Filter card */}
        <div className="p-4 mb-6 bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <FilterIcon size={14} className="text-teal-300" />
            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500">
              Orbit
            </span>
            {ORBIT_OPTIONS.map((o) => {
              const active = orbit === o.id;
              return (
                <button
                  key={o.id || "any-orbit"}
                  onClick={() => setFilter("orbit", o.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border transition-colors
                              ${
                                active
                                  ? "bg-teal-500/20 border-teal-400/60 text-teal-100"
                                  : "bg-gray-900/60 border-gray-700/60 text-gray-300 hover:bg-gray-800/80 hover:text-white"
                              }`}
                  title={o.range || ""}
                >
                  {o.id ? <Orbit size={11} /> : null}
                  {o.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 ml-5">
              Type
            </span>
            {TYPE_OPTIONS.map((o) => {
              const active = type === o.id;
              return (
                <button
                  key={o.id || "any-type"}
                  onClick={() => setFilter("type", o.id)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors
                              ${
                                active
                                  ? "bg-teal-500/20 border-teal-400/60 text-teal-100"
                                  : "bg-gray-900/60 border-gray-700/60 text-gray-300 hover:bg-gray-800/80 hover:text-white"
                              }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>

          {/* AI catalog search — natural language → structured filter */}
          <div className="pt-3 border-t border-gray-800/60">
            <NLSearchBar
              onSelectSatellite={(sat) =>
                navigate(`/satellites/${encodeURIComponent(sat.name)}`)
              }
            />
          </div>

          {/* Search row */}
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-800/60">
            <div className="relative flex-1 min-w-[240px]">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <Search size={16} />
              </span>
              <input
                ref={inputRef}
                type="text"
                placeholder="Jump to a satellite by name or NORAD…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" && suggestions.length) {
                    e.preventDefault();
                    setHighlightedIdx((i) => (i + 1) % suggestions.length);
                  } else if (e.key === "ArrowUp" && suggestions.length) {
                    e.preventDefault();
                    setHighlightedIdx((i) =>
                      i <= 0 ? suggestions.length - 1 : i - 1
                    );
                  } else if (e.key === "Enter" && suggestions.length) {
                    e.preventDefault();
                    pickSuggestion(suggestions[Math.max(0, highlightedIdx)]);
                  } else if (e.key === "Escape") {
                    setSuggestions([]);
                  }
                }}
                className="w-full pl-9 pr-9 py-2 text-sm text-white bg-gray-800/80
                           placeholder:text-gray-500 rounded-lg border border-gray-700
                           focus:outline-none focus:ring-2 focus:ring-teal-400/60"
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery("");
                    setSuggestions([]);
                  }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-white rounded hover:bg-gray-700"
                >
                  <X size={14} />
                </button>
              )}
              {suggestions.length > 0 && (
                <ul
                  ref={dropdownRef}
                  className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto
                             bg-gray-900/95 backdrop-blur-md border border-gray-700
                             rounded-lg shadow-xl divide-y divide-gray-800/60"
                >
                  {suggestions.map((s, idx) => {
                    const isH = idx === highlightedIdx;
                    return (
                      <li
                        key={s.norad_number}
                        onMouseEnter={() => setHighlightedIdx(idx)}
                        onClick={() => pickSuggestion(s)}
                        className={`px-3 py-2 cursor-pointer text-sm flex items-center gap-2
                                    ${isH ? "bg-teal-500/20 text-teal-50" : "hover:bg-gray-800"}`}
                      >
                        <SatIcon
                          size={14}
                          className={`shrink-0 ${isH ? "text-teal-300" : "text-gray-500"}`}
                        />
                        <span className="flex-1 truncate">{s.name}</span>
                        <span className="text-[10px] font-mono text-gray-400">
                          #{s.norad_number}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                         bg-gray-800/80 hover:bg-gray-700 text-gray-200
                         border border-gray-700 rounded-md transition-colors"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          </div>
        </div>

        {/* Result count strip */}
        <div className="flex items-center justify-between mb-2 text-xs text-gray-400">
          <span>
            {loading
              ? "Loading…"
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(
                  page * PAGE_SIZE,
                  total
                )} of ${total.toLocaleString()}`}
          </span>
          {error ? <span className="text-rose-300">Error: {error}</span> : null}
        </div>

        {/* Catalog table */}
        <div
          className={`relative bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl overflow-hidden transition-opacity ${
            refreshing ? "opacity-70" : "opacity-100"
          }`}
        >
          {/* Subtle teal accent gradient at the top for visual richness */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-400/40 to-transparent" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="catalog-table">
              <thead className="bg-gray-800/50 text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5">Name</th>
                  <th className="text-left px-4 py-2.5">NORAD</th>
                  <th className="text-left px-4 py-2.5">Country</th>
                  <th className="text-left px-4 py-2.5">Orbit</th>
                  <th className="text-left px-4 py-2.5">Type</th>
                  <th className="text-left px-4 py-2.5">Launched</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-t border-gray-800/60">
                        <td className="px-4 py-3"><ShimmerBar className="h-3 w-48" /></td>
                        <td className="px-4 py-3"><ShimmerBar className="h-3 w-16" /></td>
                        <td className="px-4 py-3"><ShimmerBar className="h-3 w-10" /></td>
                        <td className="px-4 py-3"><ShimmerBar className="h-3 w-12" /></td>
                        <td className="px-4 py-3"><ShimmerBar className="h-3 w-20" /></td>
                        <td className="px-4 py-3"><ShimmerBar className="h-3 w-24" /></td>
                        <td className="px-4 py-3"><ShimmerBar className="h-5 w-16 rounded-full" /></td>
                        <td className="px-4 py-3"><ShimmerBar className="h-3 w-3" /></td>
                      </tr>
                    ))
                  : rows.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} className="text-center text-gray-500 py-12">
                        No satellites match the current filter.
                      </td>
                    </tr>
                  )
                  : rows.map((sat, idx) => {
                      const isActive = sat.active_status === "Active";
                      const orbitDot = ORBIT_DOT[sat.orbit_type] || "bg-gray-500";
                      return (
                        <tr
                          key={sat.norad_number}
                          data-testid="catalog-row"
                          // Stagger reveal — pure CSS, no Framer Motion
                          // overhead per row. Disabled during refreshing
                          // so already-visible rows don't replay the
                          // animation on every filter change.
                          style={
                            !refreshing
                              ? {
                                  animation: "tk-fade-in 320ms ease-out both",
                                  animationDelay: `${Math.min(idx, 16) * 18}ms`,
                                }
                              : undefined
                          }
                          className="group border-t border-gray-800/60 hover:bg-teal-500/5 transition-colors cursor-pointer"
                          onClick={() => navigate(`/satellites/${encodeURIComponent(sat.name)}`)}
                        >
                          <td className="px-4 py-2.5 text-gray-100 font-medium truncate max-w-[18rem]">
                            <span className="group-hover:text-teal-100 transition-colors">
                              {sat.name}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-300 font-mono text-xs">
                            #{sat.norad_number}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-sm text-gray-200">
                              <span className="text-base leading-none">{getCountryFlag(sat.country)}</span>
                              <span className="text-xs text-gray-400 font-mono">{sat.country || "—"}</span>
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {sat.orbit_type ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-gray-200">
                                <span className={`w-1.5 h-1.5 rounded-full ${orbitDot} shadow-[0_0_6px_currentColor]`} />
                                {sat.orbit_type}
                              </span>
                            ) : (
                              <span className="text-gray-500 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-300 text-xs">
                            {sat.object_type || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs">
                            {sat.launch_date
                              ? new Date(sat.launch_date).toISOString().slice(0, 10)
                              : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium ${statusClasses(
                                sat.active_status
                              )}`}
                            >
                              {/* Pulsing dot for live/active satellites */}
                              <span className="relative flex w-1.5 h-1.5">
                                {isActive ? (
                                  <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 animate-ping" />
                                ) : null}
                                <span
                                  className={`relative w-1.5 h-1.5 rounded-full ${
                                    isActive
                                      ? "bg-emerald-400"
                                      : sat.active_status === "Decaying"
                                      ? "bg-amber-400"
                                      : "bg-slate-400"
                                  }`}
                                />
                              </span>
                              {sat.active_status || "Unknown"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-600 group-hover:text-teal-300 transition-all">
                            <ChevronRight
                              size={14}
                              className="group-hover:translate-x-0.5 transition-transform"
                            />
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            Page <span className="text-gray-200 font-medium">{page}</span>
            {" / "}
            {totalPages.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1 || loading}
              aria-label="First page"
              className="p-1.5 rounded-md text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1 || loading}
              aria-label="Previous page"
              className="p-1.5 rounded-md text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages || loading}
              aria-label="Next page"
              className="p-1.5 rounded-md text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages || loading}
              aria-label="Last page"
              className="p-1.5 rounded-md text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
