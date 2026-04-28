// DailyDigestCard — collapsed pull-tab on Home that opens a full briefing
// for today. Lazy: doesn't fetch until the user clicks.
import { useState } from "react";
import { Newspaper, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { fetchDailyDigest } from "../api/satelliteService";
import RichText from "./RichText";

export default function DailyDigestCard() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function toggle() {
    setOpen((v) => !v);
    if (open || data) return;
    setLoading(true);
    setError(null);
    const res = await fetchDailyDigest();
    setLoading(false);
    if (!res || res.error) {
      setError(res?.message || "Digest unavailable.");
    } else {
      setData(res);
    }
  }

  return (
    <div className="bg-gray-900/70 backdrop-blur-xl border border-teal-500/30 rounded-xl overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-teal-500/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Newspaper size={14} className="text-teal-300" />
          <div className="text-left">
            <div className="text-[12px] font-mono uppercase tracking-[0.2em] text-teal-200">
              Daily Briefing
            </div>
            <div className="text-[10px] text-gray-500">
              {data?.day || "Today's space-tracking digest"}
            </div>
          </div>
        </div>
        <ChevronDown
          size={14}
          className={`text-teal-300 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-4 py-3 border-t border-gray-800/60">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 size={12} className="animate-spin" />
              Composing today&apos;s digest…
            </div>
          )}
          {error && <div className="text-xs text-rose-300">{error}</div>}
          {data && (
            <>
              <RichText className="text-sm text-gray-100">{data.briefing}</RichText>
              <div className="mt-3 pt-2 border-t border-gray-800/60 text-[10px] text-gray-500 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Sparkles size={10} /> {data.cached ? "Cached" : "Fresh"}
                </span>
                <span>{data.day}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
