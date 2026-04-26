// Shared loading skeletons. The shimmer animation is defined as a single
// inline keyframe injected once at module level — Tailwind v3 doesn't
// ship with it. Components that render a skeleton don't need their own
// <style> tag; mounting <SkeletonStyles /> once on the page is enough.
import React from "react";

export function SkeletonStyles() {
  return (
    <style>{`@keyframes sk-shimmer { 100% { transform: translateX(100%); } }`}</style>
  );
}

export function ShimmerBar({ className = "" }) {
  return (
    <div
      className={`relative overflow-hidden bg-gray-800/60 rounded ${className}`}
    >
      <div
        className="absolute inset-0 -translate-x-full"
        style={{
          animation: "sk-shimmer 1.6s infinite",
          background:
            "linear-gradient(90deg, transparent, rgba(94,234,212,0.18) 50%, transparent)",
        }}
      />
    </div>
  );
}
