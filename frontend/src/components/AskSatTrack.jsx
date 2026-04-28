// AskSatTrack — global chat launcher (bottom-right).
// Opens a drawer with a Claude-powered analyst that can answer questions
// about the catalog, conjunctions, launches, and space weather by calling
// read-only DB tools.
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, X, Loader2, Wrench } from "lucide-react";
import { askSatTrackStream } from "../api/satelliteService";

const SAMPLE_PROMPTS = [
  "How many active GPS satellites?",
  "Most polluted altitude band right now",
  "Top 3 conjunctions in the next 24h",
  "Did Starlink launch this week?",
];

export default function AskSatTrack() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [thread, setThread] = useState([]); // [{role: 'user'|'assistant', content, toolCalls?}]
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread, loading]);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput("");
    // Append user msg + a placeholder assistant msg that we'll grow as
    // tool_call / text_delta events arrive.
    setThread((t) => [
      ...t,
      { role: "user", content: q },
      { role: "assistant", content: "", toolCalls: [], streaming: true },
    ]);
    setLoading(true);

    let assistantIdx = -1; // index into thread we're filling
    let errored = false;

    await askSatTrackStream(q, [], (ev) => {
      setThread((t) => {
        if (assistantIdx < 0) assistantIdx = t.length - 1;
        const next = [...t];
        const msg = { ...next[assistantIdx] };
        if (ev.type === "tool_call") {
          msg.toolCalls = [
            ...(msg.toolCalls || []),
            { name: ev.name, input: ev.input, summary: ev.summary },
          ];
        } else if (ev.type === "text_delta") {
          msg.content = (msg.content || "") + ev.text;
        } else if (ev.type === "done") {
          msg.streaming = false;
        } else if (ev.type === "error") {
          msg.content = ev.message || "Something went wrong.";
          msg.isError = true;
          msg.streaming = false;
          errored = true;
        }
        next[assistantIdx] = msg;
        return next;
      });
    });

    setLoading(false);
  }

  function clearThread() {
    setThread([]);
  }

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 px-4 py-2.5 rounded-full
                     bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/30
                     hover:shadow-teal-400/50 hover:scale-105 active:scale-95 transition-all
                     border border-teal-300/30"
          aria-label="Ask Sat-Track"
        >
          <Sparkles size={16} />
          <span className="text-sm font-medium">Ask Sat-Track</span>
        </button>
      )}

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-[60] pointer-events-none">
          {/* Backdrop on mobile only */}
          <div
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto md:hidden"
          />
          <div
            className="absolute bottom-0 right-0 md:bottom-5 md:right-5 w-full md:w-[420px] h-[80vh] md:h-[600px]
                       bg-gray-950/95 backdrop-blur-2xl border border-teal-500/30 md:rounded-2xl
                       shadow-2xl shadow-teal-500/20 pointer-events-auto flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/80 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-teal-300" />
                <div>
                  <div className="text-sm font-semibold text-white">Mission Control</div>
                  <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                    AI analyst · Claude Haiku
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {thread.length > 0 && (
                  <button
                    onClick={clearThread}
                    className="text-[10px] font-mono uppercase text-gray-500 hover:text-gray-300 px-2 py-1 rounded"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Conversation */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {thread.length === 0 && !loading && (
                <div className="space-y-3">
                  <div className="text-xs text-gray-400 leading-relaxed">
                    Ask anything about the catalog, conjunctions, launches, or space weather.
                    I&apos;ll query the database and answer with real numbers — never guesses.
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                      Try
                    </div>
                    {SAMPLE_PROMPTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => send(p)}
                        className="w-full text-left text-xs text-gray-300 px-3 py-2 rounded-lg
                                   bg-gray-900/60 border border-gray-800/80 hover:border-teal-500/40
                                   hover:bg-teal-500/5 transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {thread.map((m, i) => (
                <Message key={i} message={m} />
              ))}

              {loading && thread[thread.length - 1]?.role === "user" && (
                <div className="flex items-center gap-2 text-xs text-teal-300">
                  <Loader2 size={12} className="animate-spin" />
                  Thinking...
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="px-3 py-3 border-t border-gray-800/80 shrink-0"
            >
              <div className="flex items-center gap-2 bg-gray-900/80 border border-gray-800 focus-within:border-teal-400/60 rounded-lg px-3 py-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question..."
                  maxLength={1000}
                  disabled={loading}
                  className="flex-1 bg-transparent outline-none text-sm text-gray-100 placeholder:text-gray-500"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="p-1 rounded text-teal-300 hover:text-teal-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Send"
                >
                  <Send size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Message({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[90%] px-3 py-2 rounded-lg text-sm leading-relaxed whitespace-pre-line ${
          isUser
            ? "bg-teal-500/20 border border-teal-500/30 text-teal-50"
            : message.isError
            ? "bg-rose-500/10 border border-rose-500/30 text-rose-200"
            : "bg-gray-900/80 border border-gray-800 text-gray-100"
        }`}
      >
        {message.content}
      </div>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {message.toolCalls.map((tc, i) => (
            <div
              key={i}
              className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded
                         bg-gray-900/60 border border-gray-800 text-gray-400"
              title={JSON.stringify(tc.input)}
            >
              <Wrench size={9} />
              {tc.summary}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
