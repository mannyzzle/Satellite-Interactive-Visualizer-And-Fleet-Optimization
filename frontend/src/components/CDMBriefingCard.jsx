// CDMBriefingCard — collapsible Claude-generated risk explainer for a CDM event.
// Lazy-loads on first expand to avoid burning LLM credits on every event click.
import { useEffect, useState } from "react";
import { Sparkles, ChevronDown, Loader2 } from "lucide-react";
import { fetchCDMBriefing } from "../api/satelliteService";

export default function CDMBriefingCard({ cdmId }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Reset when the selected CDM changes — old briefing isn't valid.
  useEffect(() => {
    setData(null);
    setError(null);
    setOpen(false);
  }, [cdmId]);

  async function load() {
    if (loading || data) return;
    setLoading(true);
    setError(null);
    const res = await fetchCDMBriefing(cdmId);
    setLoading(false);
    if (res?.error) {
      setError(res.message || "Briefing unavailable.");
    } else {
      setData(res);
    }
  }

  function toggle() {
    setOpen((v) => !v);
    if (!open) load();
  }

  return (
    <div className="mt-4 border border-teal-500/30 rounded-lg overflow-hidden bg-gradient-to-br from-teal-500/5 to-transparent">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-teal-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-teal-300" />
          <span className="text-[12px] font-mono uppercase tracking-[0.2em] text-teal-200">
            AI risk briefing
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-teal-300 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-4 py-3 border-t border-teal-500/20">
          {loading && (
            <div className="flex items-center gap-2 text-[12px] text-gray-400">
              <Loader2 size={12} className="animate-spin" />
              Generating briefing…
            </div>
          )}

          {error && (
            <div className="text-[12px] text-rose-300">
              {error}
            </div>
          )}

          {data && (
            <>
              <p className="text-sm text-gray-100 leading-relaxed whitespace-pre-line">
                {data.briefing}
              </p>
              <div className="mt-3 pt-2 border-t border-gray-800/60 text-[10px] text-gray-500 flex items-center justify-between">
                <span>Model: {data.model}</span>
                <span className="italic">{data.disclaimer}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
