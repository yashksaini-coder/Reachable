"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

// Fenced code in the guide. Same chrome as the console's "How HydraDB answered this" card so a
// snippet and an executed statement read as one system: labelled header, copy, --border (not
// --line, which is invisible against --code).
//
// Highlighting is a deliberate 40 lines rather than a build-time dependency: the guide has six
// blocks in three languages, and a wrong token is visible on the page immediately. Only three
// classes exist — string, comment, number — because more would compete with the verdict palette.

type Piece = { t: string; c?: string };

const RULES: Record<string, { comment?: RegExp; string?: RegExp; number?: RegExp }> = {
  bash: { comment: /#[^\n]*/y, string: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/y },
  json: { string: /"(?:[^"\\]|\\.)*"/y, number: /-?\d+(?:\.\d+)?/y },
  python: { comment: /#[^\n]*/y, string: /"""[\s\S]*?"""|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/y, number: /\b-?\d+(?:\.\d+)?\b/y },
  cypher: { comment: /\/\/[^\n]*/y, string: /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/y, number: /\b-?\d+(?:\.\d+)?\b/y },
};

/** Single left-to-right pass; anything unmatched is plain text, so a gap degrades to no colour. */
function tokenise(text: string, lang: string): Piece[] {
  const rules = RULES[lang];
  if (!rules) return [{ t: text }];
  const out: Piece[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    let hit: Piece | null = null;
    for (const [cls, re] of Object.entries(rules) as [string, RegExp][]) {
      re.lastIndex = i;
      const m = re.exec(text);
      if (m && m.index === i) {
        hit = { t: m[0], c: cls };
        break;
      }
    }
    if (hit) {
      if (plain) {
        out.push({ t: plain });
        plain = "";
      }
      out.push(hit);
      i += hit.t.length;
    } else {
      plain += text[i];
      i += 1;
    }
  }
  if (plain) out.push({ t: plain });
  return out;
}

const TONE: Record<string, string> = { string: "text-l0", comment: "text-dim", number: "text-signal-2" };

export function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [done, setDone] = useState(false);
  const pieces = tokenise(text, lang);

  return (
    <figure className="my-5 overflow-hidden rounded-lg border border-border bg-card2">
      <figcaption className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-3">
        <span className="font-mono text-[11px] uppercase leading-none tracking-[0.1em] text-dim">{lang === "text" ? "snippet" : lang}</span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 font-mono text-[11.5px] leading-none text-dim transition-[color,background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.97]"
        >
          {done ? <Check className="size-3.5 text-l0" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {done ? "copied" : "copy"}
        </button>
      </figcaption>
      {/* pb-4 keeps the 10px scrollbar off the last line; the thumb inset matches --code here */}
      <pre className="doc-code m-0 overflow-x-auto overscroll-x-contain bg-code px-3.5 pb-4 pt-3 font-mono text-[12.5px] leading-[1.7] text-mut [scrollbar-width:thin]">
        <code>
          {pieces.map((p, i): ReactNode => (p.c ? <span key={i} className={TONE[p.c]}>{p.t}</span> : <span key={i}>{p.t}</span>))}
        </code>
      </pre>
    </figure>
  );
}
