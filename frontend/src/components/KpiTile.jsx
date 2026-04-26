// Compact KPI tile used by Tracking + SatelliteDetail. Keeps the visual
// language consistent between the two analytical pages.
import React from "react";
import { ShimmerBar } from "./Skeleton";

export function KpiTile({
  Icon,
  label,
  value,
  sub,
  accent = "text-teal-300",
  className = "",
}) {
  return (
    <div
      className={`flex-1 min-w-[180px] p-4 bg-gray-900/85 backdrop-blur-xl
                  border border-gray-700/60 rounded-xl ${className}`}
    >
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500">
        {Icon ? <Icon size={14} className={accent} /> : null}
        {label}
      </div>
      <div className={`mt-2 text-2xl sm:text-3xl font-semibold ${accent}`}>
        {value}
      </div>
      {sub ? (
        <div className="mt-1 text-xs text-gray-400 truncate">{sub}</div>
      ) : null}
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="flex-1 min-w-[180px] p-4 bg-gray-900/85 backdrop-blur-xl border border-gray-700/60 rounded-xl">
      <ShimmerBar className="h-3 w-24 mb-3" />
      <ShimmerBar className="h-8 w-32 mb-2" />
      <ShimmerBar className="h-3 w-40" />
    </div>
  );
}
