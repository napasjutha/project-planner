# Visual Redesign — Ive-Style Refinement — Design Spec

**Date:** 2026-07-08
**Status:** Approved design (brainstorm complete)
**Scope:** Pure visual/CSS refinement across the entire app (`theme.css`, `layout.css`; `print.css` untouched — it's a media-query override, orthogonal to this work). No behavior changes, no new dependencies, no structural HTML changes beyond what a specific treatment genuinely requires.

## 1. Purpose

The app works correctly across all 5 shipped phases plus the Save/Load and Data Quality plans, but its visual language accumulated ad hoc: inconsistent border-radius (3px/4px/6px/8px used interchangeably), a single flat gray for both borders and hover backgrounds, no shadow/depth system, a cramped KPI display, and status shown as plain colored text rather than something more scannable. This redesign applies a single coherent, restrained design language — in the spirit of Apple/Jony Ive-era interface design — across every view, without touching any interactive behavior.

## 2. Decisions Log

| Question | Decision |
|---|---|
| Brand color | Keep `--kpmg-blue` (`#00338D`) as the one accent color — this instance is still used for KPMG work. Everything else (neutrals, spacing, depth, typography) is redesigned around it. |
| Data density (Plan tree, Gantt, Reports tables) | **Refined but compact.** Slightly taller rows (~32-34px vs today's ~29px) with full typographic/color polish, but density stays close to today's — a large task list must still scan quickly. Chrome elements (header, KPI cards, buttons, tabs, Dashboard cards) get the fuller airy treatment; dense data areas do not. |
| Status colors | Kept functionally vivid (legibility for scanning > restraint) but harmonized to one cohesive family — see §3. |
| Dark mode | Redesigned in lockstep with light mode via the existing CSS custom-property system — no separate dark-mode design pass needed, both themes stay driven by the same token set. |
| Reports panel | Stays print-safe / theme-independent (hardcoded hex, not CSS vars — Copy-as-Image must render identically regardless of the live theme toggle, an existing deliberate choice). Hardcoded values are updated to match the new palette, not converted to vars. |

## 3. Design Tokens

### 3.1 Color — Light (`:root` in `theme.css`)

| Token | Old value | New value | Notes |
|---|---|---|---|
| `--kpmg-blue` | `#00338D` | `#00338D` | unchanged — the one accent |
| `--kpmg-blue-mid` | `#005EB8` | `#005EB8` | unchanged — accent hover state |
| `--kpmg-blue-light` | `#0091DA` | `#0091DA` | unchanged — reused for in-progress status + plan-bar |
| `--surface` | `#ffffff` | `#ffffff` | unchanged |
| `--surface-alt` | `#f5f6f7` | `#f7f7f8` | refined neutral |
| `--surface-sunken` | *(none)* | `#f0f1f2` | **new** — track/well backgrounds (progress bar wells, holiday weekend cells, refined hover tint) |
| `--border` | `#e1e4e8` | `#e5e5ea` | refined hairline gray |
| `--border-strong` | *(none)* | `#d1d1d6` | **new** — stronger dividers (table header underline) |
| `--text` | `#1a1a1a` | `#1d1d1f` | refined near-black |
| `--text-secondary` | *(was `--text-muted` `#5b6470`)* | `#6e6e73` | **renamed** from `--text-muted` — every `var(--text-muted)` usage updates to `var(--text-secondary)` |
| `--text-tertiary` | *(none)* | `#98989d` | **new** — least-prominent text (timestamps, Updated At, placeholder-like text) |

### 3.2 Status colors (harmonized family, both themes)

| Token | Old | New |
|---|---|---|
| `--status-not-start` | `#9aa5b1` | `#98989d` |
| `--status-in-progress` | `#0091DA` | `#0091DA` (unchanged) |
| `--status-delayed` | `#d64545` | `#ff3b30` |
| `--status-complete` | `#1a8f5e` | `#34c759` |
| `--status-blocked` | `#d64545` | `#ff3b30` (unchanged pairing with delayed) |
| `--status-cancelled` | `#9aa5b1` | `#98989d` (unchanged pairing with not-start) |

### 3.3 Color — Dark (`[data-theme="dark"]`)

| Token | Old value | New value |
|---|---|---|
| `--surface` | `#1c1e22` | `#1c1c1e` |
| `--surface-alt` | `#26292e` | `#2c2c2e` |
| `--surface-sunken` | *(none)* | `#232325` |
| `--border` | `#33373d` | `#38383a` |
| `--border-strong` | *(none)* | `#48484a` |
| `--text` | `#e7e9ec` | `#f5f5f7` |
| `--text-secondary` | `#9aa5b1` | `#98989d` |
| `--text-tertiary` | *(none)* | `#6e6e73` |

Status colors are unchanged between themes — already vivid enough against a dark background.

### 3.4 Spacing

A 4px-based scale used as literal values (matching the codebase's existing convention of literal px in rules, not spacing custom properties): **4, 8, 12, 16, 24, 32, 48**. Every padding/margin/gap touched by this redesign snaps to one of these.

### 3.5 Typography scale

| Size | Usage |
|---|---|
| 11px | Micro-labels: table/section headers, KPI labels — uppercase, `letter-spacing: 0.04em` |
| 12px | Secondary/dense data: dashboard lists, snapshot rows, holiday labels |
| 13px | Base body/data size (unchanged from today's default) |
| 15px | Emphasized body: report meta, dialog copy |
| 20px | Section/report h2-level headings |
| 28px | Display numerals: KPI values, report h1 — refined up from today's 18px KPI value, `font-weight: 500`, `font-variant-numeric: tabular-nums` |

### 3.6 Depth

- `--shadow-sm: 0 1px 2px rgba(0,0,0,0.06)` — cards, KPI tiles, buttons at rest (light mode only — see below).
- `--shadow-md: 0 4px 16px rgba(0,0,0,0.12)` — context menu, overlay card, dropdowns (replaces today's ad hoc `0 4px 12px rgba(0,0,0,0.15)`).
- **Dark mode:** shadows don't read against dark backgrounds. Cards/tiles use a `1px solid var(--border)` instead of `--shadow-sm` in dark mode. Floating elements (context menu, overlay card) keep a shadow but darker/higher-opacity: `0 4px 16px rgba(0,0,0,0.4)`.

### 3.7 Radius

Two radii replace today's inconsistent 3/4/6/8px mix:
- `--radius-sm: 6px` — buttons, inputs, small tags/pills.
- `--radius-lg: 12px` — cards, panels, overlays, context menu.

### 3.8 Motion

- `150ms ease` — color/background/border-color hover transitions (buttons, rows, tabs).
- `200ms ease` — transform-based transitions (button press `scale(0.98)`, tab underline color/width change).
- Wrap all transition declarations so `@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }` disables them — cheap accessibility addition, consistent with the polish goal.

## 4. Component Treatment

1. **Header / KPI row** — `.kpi-card` padding `12px 20px` (was `8px 14px`), `--radius-lg`, `--shadow-sm`/dark-border. `.kpi-value` → 28px, weight 500, tabular-nums. `.kpi-label` → 11px uppercase tracked, `--text-tertiary`. `#project-name` → 18px, slight negative tracking.
2. **Buttons** — two tiers:
   - *Primary* (`#save-button`, `#take-snapshot-button`, `#add-holiday-button`, report copy buttons, `.theme-btn.active`, `.gantt-zoom-btn.active`): `--kpmg-blue` bg, `--radius-sm`, padding `8px 18px`, `--shadow-sm`; hover → `--kpmg-blue-mid` + `--shadow-md`; active → `transform: scale(0.98)`.
   - *Secondary* (`#add-task-button`, `#load-project-button`, holidays/settings buttons, inactive gantt-zoom): `--surface` bg, `1px solid var(--border)`, `--radius-sm`; hover → `--surface-sunken`.
   - All buttons: `transition: background 150ms ease, box-shadow 150ms ease, transform 150ms ease`.
3. **Tabs** (`.view-tab`) — padding `8px 16px` (was `6px 14px`), inactive → `--text-secondary`, active → `--kpmg-blue` with `border-bottom-color` transitioning 200ms on switch (pure CSS, no JS change).
4. **Plan tree** — row padding `8px 20px` (was `6px 20px`, targets ~32-34px row height); divider stays `1px solid var(--border)` (now reads as hairline via the refined token); row hover → `--surface-sunken` (softer than today's flat `--surface-alt`); `.tree-row.is-parent` keeps `font-weight: 600` + `--surface-sunken` background, adds `border-left: 3px solid var(--kpmg-blue-light)` as an accent hint. Status cells (`.status-*`) become small pill badges: `padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;`, background = status color at ~12% opacity, text = status color at full opacity (e.g. Delayed → `background: rgba(255,59,48,0.12); color: var(--status-delayed);`).
5. **Gantt** — bars get `border-radius: 4px` + `--shadow-sm`; status-date line refined to `1px` width in `--kpmg-blue` (existing marker element restyled, not restructured); holiday shading opacity reduced (~0.5 → ~0.35) for subtlety.
6. **Dashboard** — `.dashboard-section` padding `20px` (was `14px`), `--radius-lg`, `--shadow-sm`/dark-border. Donut colors remapped to the new status palette. `.dashboard-bar-wrap` track → `--surface-sunken`; bars get `--radius-sm` rounded ends; the "plan" ghost bar's opacity drops slightly (0.5 → 0.35) for cleaner layering under the solid "actual" bar.
7. **Snapshots / Settings** — `.settings-section` gets the same card treatment as `.dashboard-section`. Row dividers (`.snapshot-row`, `.pic-editor-row`) stay hairline via the refined `--border`. Delete/remove buttons (`.snapshot-delete-btn`, `.pic-remove-btn`, `.holiday-remove-btn`) lose their permanent border/background, becoming quiet text-only buttons that show background + border only on hover — reduces visual noise when not being interacted with.
8. **Holidays calendar** — `.holiday-month` gets card treatment (`--shadow-sm`/dark-border, `--radius-lg`). `.holiday-day-holiday` moves from a solid `--kpmg-blue` fill to the same pill-badge language as status cells (`background: rgba(0,51,141,0.12); color: var(--kpmg-blue);`), `.holiday-day-weekend` → `--surface-sunken`.
9. **Reports panel** — stays hardcoded/theme-independent per §2. Hex values updated: `#1a1a1a` → `#1d1d1f`, `#5b6470` → `#6e6e73`, `#f5f6f7` → `#f7f7f8`, `#e1e4e8` → `#e5e5ea`, `#00338D`/`#005EB8` unchanged. `.report-kpi` tiles get the same shadow/radius/padding refinement as the live KPI cards.
10. **Overlays / context menu** — `.overlay-card` and `.context-menu` get `--radius-lg`, `--shadow-md` (light) / dark-mode shadow variant, generous padding (`24px` card, `8px 0` menu — unchanged for the menu, already correct).

### 3.9 Opacity-tint contrast (status pills, holiday pill)

The status-pill and holiday-pill backgrounds in §4 use a color at ~12% opacity against `--surface`. This is a light-mode value; verified live in both themes per §5 — if the 12% tint reads with insufficient contrast against the dark-mode `--surface` (`#1c1c1e`), raise it to ~20% opacity in `[data-theme="dark"]` only. This is a live-verification adjustment, not an open design question — the light-mode value is locked at 12%.

## 5. Testing

Pure CSS/token change — the existing 108 Node tests are unaffected (no engine/UI-logic files touched) and must still show 108/108 passing after this work, proving zero behavioral regression. Actual verification is visual: a controller-run pass across all 8 views (Plan, Gantt, S-Curve, Dashboard, Snapshots, Settings, Holidays, Reports) in both light and dark themes, via real-browser screenshots — checking for layout breakage, overflow/clipping regressions, all interactive elements still clickable/editable exactly as before, and no console errors. Same pattern as every prior phase's final task.

## 6. Out of Scope

- No new HTML structure beyond what a listed treatment above literally requires (none currently require new wrapper elements).
- No behavior changes anywhere — every click target, keyboard interaction, and data flow is unchanged.
- No new dependencies — no web fonts, icon fonts, or CSS frameworks; hand-written CSS only, consistent with the project's standing zero-dependency rule.
- `print.css` is untouched (separate print-media concern, orthogonal to this visual pass).
