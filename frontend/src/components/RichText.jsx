// Lightweight inline markdown renderer for AI-generated text.
//
// Why this exists: the AI analyst components (AskSatTrack, CDMBriefingCard,
// DailyDigestCard, ManeuverTimeline, Reentry briefing) used to render model
// output with `whitespace-pre-line`, which preserved newlines but left
// **bold**, *italic*, and `code` markers as literal characters. The user
// flagged it: "the ** in responses arent rendering well".
//
// We don't pull in a full markdown lib for ~1 KB of output. This handles:
//   - **bold** → <strong>
//   - *italic* → <em>          (single-asterisk OR _underscore_)
//   - `code`   → <code> chip
//   - paragraphs from blank lines
//   - simple bullet lists ("- " or "• " at line start)
// It does NOT support headings, links, tables, code fences. The AI is
// instructed via prompt to keep output simple, so that's deliberate.
//
// Inputs are ALWAYS text (never HTML), so React's auto-escaping is safe.

import React from "react";

// Token an inline run of text into <strong>/<em>/<code>/raw spans.
// Pass-1: split on `code`. Pass-2: split each non-code chunk on **bold**.
// Pass-3: split on *italic*/_italic_. Plain regex, no dependencies.
function renderInline(text) {
  if (!text) return null;
  const out = [];
  // Code segments first so their contents aren't bolded/italicized.
  const codeRe = /`([^`]+)`/g;
  let lastIdx = 0;
  let m;
  let key = 0;
  while ((m = codeRe.exec(text)) !== null) {
    if (m.index > lastIdx) {
      out.push(...renderBoldItalic(text.slice(lastIdx, m.index), key));
      key += 100;
    }
    out.push(
      <code
        key={`c${key++}`}
        className="px-1 py-0.5 rounded bg-gray-800/80 border border-gray-700/60 text-teal-200 text-[0.85em] font-mono"
      >
        {m[1]}
      </code>
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    out.push(...renderBoldItalic(text.slice(lastIdx), key));
  }
  return out;
}

function renderBoldItalic(text, baseKey) {
  // Bold first (greedy so **a** wins over *a*).
  const parts = [];
  let i = 0;
  let key = baseKey;
  while (i < text.length) {
    const bStart = text.indexOf("**", i);
    if (bStart === -1) {
      parts.push(...renderItalic(text.slice(i), key));
      key += 50;
      break;
    }
    const bEnd = text.indexOf("**", bStart + 2);
    if (bEnd === -1) {
      parts.push(...renderItalic(text.slice(i), key));
      key += 50;
      break;
    }
    if (bStart > i) {
      parts.push(...renderItalic(text.slice(i, bStart), key));
      key += 50;
    }
    parts.push(<strong key={`b${key++}`}>{renderItalic(text.slice(bStart + 2, bEnd), key)}</strong>);
    key += 50;
    i = bEnd + 2;
  }
  return parts;
}

function renderItalic(text, baseKey) {
  // Italic via single-asterisk *foo* or _foo_. Avoid matching inside words
  // (so a*b*c stays plain). Use a permissive regex; mostly fine for our
  // domain (AI output is usually well-formed).
  const out = [];
  let lastIdx = 0;
  let key = baseKey;
  const re = /(?:^|[\s(])([*_])([^*_\n]+)\1(?=[\s.,!?;:)]|$)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + (m[0].startsWith(m[1]) ? 0 : 1);
    if (start > lastIdx) out.push(text.slice(lastIdx, start));
    out.push(<em key={`i${key++}`}>{m[2]}</em>);
    lastIdx = start + m[2].length + 2;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out;
}

export default function RichText({ children, className = "" }) {
  if (typeof children !== "string") return null;
  // Split into blocks separated by blank lines so we can render proper
  // paragraphs + lists rather than relying on whitespace-pre-line.
  const blocks = children.split(/\n\s*\n/).filter((b) => b.trim().length > 0);
  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        // Detect list block: every line starts with "- ", "* ", or "• ".
        const isList = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} className="list-disc pl-5 space-y-1">
              {lines.map((l, li) => {
                const item = l.replace(/^\s*[-*•]\s+/, "");
                return <li key={li}>{renderInline(item)}</li>;
              })}
            </ul>
          );
        }
        // Otherwise, render lines with <br/>s within a paragraph.
        return (
          <p key={bi} className="leading-relaxed">
            {lines.map((l, li) => (
              <React.Fragment key={li}>
                {li > 0 ? <br /> : null}
                {renderInline(l)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
