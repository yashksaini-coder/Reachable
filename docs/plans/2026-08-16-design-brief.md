# Reachable — UI design brief (hand to a design tool / designer)

Everything below is UI only. Data, queries and backend are frozen; the designer changes how it
looks, moves and reads — never what it claims.

## 1. What the product is, in one screen's worth

Reachable is a **supply-chain incident console**. When an npm package is compromised, an
engineer opens one page and reads six answers about *their* services: who is exposed, which
version did it, who pulled it in **while it was still installable**, who else the same
maintainers could hurt next, which look-alike package names exist, and the total blast radius
with a verdict per service (**L2 act now · L1 imported · L0 present only · unscanned**).
Every answer card carries the exact database statement that produced it and its latency.

The reader is under pressure, probably at night, on a wide monitor, scanning for red. The UI
must be **legible before it is beautiful**, and beautiful because it is disciplined.

## 2. Current aesthetic (keep, refine — do not replace)

- **Direction:** dark operations console · Swiss/functionalist · Rams-style "nothing without a
  job". One accent for actions/emphasis (**signal orange**), four semantic verdict colours that
  mean the same thing on every page, tabular numerals, dense-but-breathable grid, hairline
  dividers, no gradients, no emoji, no glassmorphism, no purple.
- **Dark-only by design** (`color-scheme: dark`). Do not add a light theme.
- **Tokens (Tailwind v4 `@theme`, shadcn semantic tokens mapped on top):**
  `background #0b0c0f` · `card #111318` · `popover #171a21` · `accent #1c2029` · `border #232733`
  · `input #2f3442` · `foreground #e6e8ee` · `muted-foreground #a9afbd` · `sidebar #0e1014`
  `signal #ff6a1a` (accent/primary) · `signal-2 #ffb08a` (accent tint for text on dark)
  `l2 #ff5c5c` (act now / red) · `l1 #f5b400` (imported, in-window / amber) · `l0 #2fd07f`
  (present only, healthy / green) · `unknown #8b93a7` (unscanned / grey) · `radius 8px`.
- **Type:** IBM Plex Sans (UI, headings) + JetBrains Mono (identifiers, shas, numbers, Cypher);
  `tnum` on by default; ligatures off in code; headings `text-balance`, prose `text-pretty`.
  Scale in use: 10.5/11 (labels, uppercase tracked) · 12–13 (tables, body) · 17 (card titles)
  · 28–32 (page h1) · 40+ (stat numerals).
- **Surface:** cards = `rounded-lg`/`xl` + 1px border + `.elev` layered shadow
  (`0 0 0 1px rgba(255,255,255,.03), 0 1px 2px rgba(0,0,0,.6), 0 16px 40px -24px rgba(0,0,0,.9)`).
  Concentric radii (outer = inner + padding).
- **Motion:** `motion` v12 only. Springs `duration 0.3, bounce 0`; enter = opacity 0→1 + y 6→0,
  staggered 60–100 ms by semantic chunk; exits shorter (0.2 s, y 2); icon swaps cross-fade
  opacity/scale(.25→1)/blur(4→0); press `active:scale-[0.96]`; sidebar active indicator is a
  `layoutId` slide; incident sections "settle" on scroll (0.55→1 opacity, never invisible);
  `prefers-reduced-motion` neutralises all of it. Never `transition-all`.
- **Iconography:** lucide, single stroke-width 1.75 everywhere (set in CSS).

## 3. Non-negotiable UI rules

1. **No event/track/hackathon copy anywhere.** It is a product.
2. **Verdict colours are semantic** — never use red/amber/green decoratively. Orange is the only
   free accent.
3. **Never make a number look estimated or a claim look bigger than the data.** "unscanned" is
   never styled as safe; "not computed" is never a zero; upper bounds keep their `UPPER BOUND`
   marker; the executed Cypher stays visible (collapsed is fine, hidden is not).
4. Contrast ≥ 4.5:1 for text on all surfaces (muted `#a9afbd` on `#111318` passes; do not go
   lighter than `#8b93a7` for anything that must be read).
5. Hit areas ≥ 40 px, focus-visible ring (`ring-2 ring-signal/50`) on everything interactive.
6. Wheel/scroll inside the graph canvases must stay confined to the canvas.
7. Mobile is secondary but must not break: sidebar → sheet, tables → horizontal scroll inside
   the card, page body never scrolls sideways.

## 4. Pages and the UI pieces they contain

### Shell (every page)
- **Sidebar** (`nav.tsx`): logo mark, 5 items with two-line labels (name + 3-word hint),
  sliding active indicator, bottom **status chip** ("HydraDB up · 3 incidents") — a live signal
  that must read as a status light, not a button. Mobile: sheet drawer.
- **Primitives** (`ui.tsx`): `HydraCard` (collapsible "How HydraDB answered …" strip: label,
  quoted question, rows/ms/cold-warm, copy button, code block on open) · `Question` (numbered
  card: `Q1` mono tag, title, right-aligned summary, body, optional footer bar) · `Stat` (big
  numeral + lowercase label, optional coloured top rule) · `Level` pill (L2/L1/L0/unscanned) ·
  `Kind` pill (malware/vuln) · `Chip` · `Limits`/`Notes` (caveat rows with ⓘ) · `ShowAll`.

### `/` Incidents (home)
Small orange eyebrow label, a two-line h1 stating the value proposition, three big stats on the
right (services exposed · resolved while live · reachable · act now), then an **incident list**
(rows, not cards): advisory id (mono, orange) + kind/severity pills, description line, columns
exposed · while live · act now · unscanned · published · cold·warm ms, chevron.
*Design opportunities:* the empty right half above the fold on wide screens; a stronger visual
hierarchy between the h1 and the list; the ms column could read as a tiny inline sparkline.

### `/incident/[advisory]` — the report (the page that matters most)
Top → bottom:
1. **Header**: breadcrumb "← incidents", h1 advisory id (mono), kind · severity pills, published,
   source link; one-sentence headline; a **six-Stat strip** with coloured top rules per verdict.
2. **Blast graph** (SVG, `graph.tsx`): four columns — affected version (red dot) → dependency
   versions → lockfiles (amber when committed in window) → services (dot coloured by verdict);
   legend under it. Purely from returned paths.
3. **Q1 Which services are transitively exposed** — verdict distribution bar (L2/L1/L0/unscanned
   segments) above a table (service · verdict pill · lockfiles · pulled in via · latest exposed
   commit), two HydraCards, notes.
4. **Q2 Which version introduced it** — table (version + `first` chip · published (exact) ·
   live until + `UPPER BOUND` chip · registry `removed` in red).
5. **Q3 Resolved while live ★** — the **timeline** SVG: time axis with day ticks, orange
   installable-window bar (dashed right edge = upper bound), amber ▲ commits inside the window,
   red ▲ commits pinning a removed version, dotted "advisory published" marker, "×n" clusters;
   legend row; evidence table (service · lockfile sha+time · version · evidence words in
   amber/red · window range with UPPER BOUND chip).
6. **Q4 Shared maintainers ★** — maintainer chips (login · 2FA unknown), table (co-maintained
   package · weekly downloads · services resolving it today: number + horizontal bar + names;
   rows past the cap show "— not computed" in muted).
7. **Q5 Typosquats ★** — "near <pkg>" label, chips grouped by kind (`SCOPE`, `HYPHEN`, …) with
   `d1` distance.
8. **Q6 Complete blast radius** — three columns of lists (exposed · while live with sha/time ·
   act now), a footer bar with the regenerate command and badge snippet in mono.
9. **"Beyond the watched set"** — button "Search GitHub for exposed public repos" → list rows
   (repo link · versions · `watch` button / ✓ watched), limitation line.
10. **Provenance footer** (generated, engine digest, bolt URI, node counts) + `details`.
11. **Right rail** (`rail.tsx`, ≥md): "QUESTIONS" Q1–Q6 with counts, active section highlighted
    by an orange bar.
*Design opportunities:* the page is long — the rail could become a sticky mini-map with the
verdict colour per section; the six-stat strip and Q1 distribution bar are two renderings of the
same numbers (unify or differentiate on purpose); the blast graph deserves a stronger visual
signature (it is the "hero" of the product); the HydraCard strips are visually similar to notes
— give the *engine* strips a recognisable identity (a mono tag, a faint orange left rule).

### `/incident/[advisory]/[owner]/[repo]` — one service inside an incident
Header (service slug, verdict pill, incident), a **proving-path** block per exposed lockfile:
chain chips `debug@4.4.2 ←DEPENDS_ON← agent-base@6.0.2 ←RESOLVED← 5789d208…` with hop count,
commit sha/time, verdict + reachability details (files scanned, imports found), HydraCards.
*Opportunity:* the chain is the single most explanatory visual — could be a small horizontal
node-link strip instead of chips.

### `/board` — triage board (kanban)
Five lanes with coloured top borders (Act now red · Resolved while live amber · Imported amber ·
Unscanned grey · Present only green), each lane header = title + hint + count; cards = service
slug (mono), advisory id, via, sha · time. States are computed from data.
*Opportunity:* lane density (present-only lane dominates); a compact card mode; column min-width
and horizontal scroll rules on narrow screens.

### `/services` — what is being watched
"Add repository" card (label, one combined input+button control with an orange `Add` button,
helper/error text, then a **JobCard** with per-step progress lines and a settle check) · "recent
jobs" list · the **services table** (uniform rows: repo · cohort chip core/victim · lockfiles ·
latest commit · incidents). Degraded state when the API is down (form disabled, note).
*Opportunity:* the JobCard step list is the best place for a tasteful progress animation
(loading→check swaps); the table wants a subtle row-hover and sticky header.

### `/ask` — typed questions (no LLM)
Centred, minimal chat: greeting line, input with a mono caret feel, **subtle suggestion chips**
(question + grey hint) that disappear after the first ask, message thread where each answer is a
one-sentence summary + a typed result (table / chain chips / maintainer chips / typosquat chips /
raw table) + a HydraCard. Empty answer = grey `none` chip with an honest sentence.
*Opportunity:* input focus/idle states; keeping the thread readable when tables are wide; a
"what can I ask" hint drawer instead of always-visible chips.

### `/graph` — counts, schema, ingest jobs, explorer
Top: **stat tiles** per label (Service · Lockfile · Package · Version · Advisory · Maintainer ·
File) with live counts; **schema table** (from · REL · to · source); **jobs** list with status
dots; the **explorer**: seed picker (chips), then the **force-directed SVG** (nodes coloured by
label — service orange, lockfile amber, version grey, package blue, advisory red, maintainer
green, file purple; edges grey, AFFECTS red), non-passive wheel zoom, drag-pan, +/−/fit
control, legend, node-count, click → **side panel** (label, key, "ask about this" link).
*Opportunity:* legend and controls could sit in a single bottom bar; hover tooltips are native
`<title>` — a custom tooltip would look more finished; label collisions at high density.

### Small surfaces
- `/badge/{owner}/{repo}.svg` — flat two-cell shields-style badge, verdict-coloured right cell.
- `not-found` — icon in a muted circle, one sentence, one action.

## 5. Suggestions to pass along (colour theory, style, modern-minimal craft)

**Colour**
- Keep the palette **near-monochrome + one accent + four semantics**. Consider a slightly warm
  or cool bias for the neutrals rather than pure grey: today's neutrals are cool
  (`#0b0c0f → #232733`, blue-tinted); make sure every neutral step follows the same hue so the
  UI reads as one material. Suggested 6-step ladder (bg → hover):
  `#0a0b0e · #0f1116 · #131620 · #181c27 · #1e2330 · #262c3a`.
- Give the **accent a small tonal family** (base `#ff6a1a`, tint `#ffb08a`, ink-on-accent
  `#0b0c0f`, translucent `rgba(255,106,26,.12)` for fills) and use fills sparingly: at most one
  filled orange element per viewport (the primary action), everything else outlines/text.
- **Semantic colours must survive on dark**: `#f5b400` amber and `#2fd07f` green are bright —
  use them mostly as text/rules/dots at 100 %, and as `/15` fills for backgrounds; avoid large
  saturated areas (visual fatigue at 3 a.m.).
- **Red is rare by design** — a page with no L2 has almost no red; that contrast is the message.
  Do not introduce red into decorative places (chart lines, borders) or the signal dilutes.
- Consider a very faint **elevation tint** instead of only shadow: cards 2–3 % lighter than
  background, popovers 2–3 % lighter than cards. Never lighter than `#262c3a` for surfaces.
- Text ladder: primary `#e6e8ee`, secondary `#a9afbd`, tertiary/labels `#8b93a7`, disabled at
  38–50 % opacity. Do not add a fourth grey.

**Style / composition**
- **Grid discipline:** a 4/8 spacing scale, one content max-width (~1200–1280 px) plus the rail;
  everything aligns to column edges — the eye should find straight vertical lines down the page.
- **Type does the hierarchy**: uppercase 10.5–11 px tracked labels for metadata, 13 px body,
  17 px card titles, one big numeral style. Resist adding sizes. Prefer weight 500 over 600/700.
- **Mono is for identity, not decoration**: shas, keys, package@version, Cypher, timestamps.
  Prose stays in the sans.
- **Rules over boxes**: hairline dividers (`border`) inside cards; boxes only where a card is a
  navigable unit. Avoid nesting cards inside cards more than one level.
- **Depth = shadow + 2–3 % tint**, not thick borders. Keep radii concentric.
- **Signature moments** (where a little more craft is worth it): the blast graph, the Q3 timeline,
  the proving-path chain, the six-stat strip, the status chip. Everything else should be quiet.
- **Empty / loading / error states are designed** (muted icon circle, one sentence, one action) —
  the console degrades often on purpose (live API down on the read-only deploy).
- **Density with breathing room**: 40–44 px rows in tables, 12–16 px card padding, 24–32 px
  between sections; section headers with the small tracked label.
- Avoid the generic AI-dashboard look: no purple, no gradients, no glass, no rounded-3xl blobs,
  no emoji, no illustration. Reference feel: Linear's dark mode discipline, Vercel's dashboard
  spacing, Grafana's data density done tastefully, Bloomberg-terminal legibility without its
  colours.

**Motion (modern-minimal)**
- Everything ≤ 350 ms; springs with `bounce 0`; enters stagger, exits are shorter and softer.
- Animate **only state changes and reveals** (loading→check, section settle, lane card
  reorder, graph focus dim/undim). No idle motion, no ambient loops except a 1 Hz status dot.
- Numbers count up once on first paint; never re-animate on re-render.
- Reduced motion = zero motion.

**Micro-copy**
- lower-case metadata labels, sentence-case prose, no exclamation marks, exact words
  ("upper bound", "not computed", "unscanned") kept verbatim — they carry meaning.

## 6. What to deliver back

Per page: a spec of changed tokens/components (not a redesign of the information), with a
Before/After list grouped by principle (radius · shadow/elevation · type · colour · spacing ·
motion · states), and any new component drawn in the existing primitive vocabulary
(`Question`, `HydraCard`, `Stat`, `Level`, `Chip`, `Limits`). Keep all copy; keep all data;
keep the dark theme; keep the semantic colours' meanings.
