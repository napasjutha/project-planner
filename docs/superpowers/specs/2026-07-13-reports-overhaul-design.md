# Reports Tab Overhaul & PDF Export — Design Spec

**Date:** 2026-07-13
**Status:** Approved design (brainstorm complete)
**Scope:** Replace the Reports tab's current Weekly/Executive summary content with a biweekly status-deck format matching the reference PDF's structure, styled per the reference HTML dashboard's visual language, exportable as a real multi-page PDF. Depends on the Issues/Risks/Decisions tab and the Activities calendar tab (both separate, prior specs in this batch) for two of its content pages.

## 1. Reference Materials

- **`RAM_Biweekly Meeting Template.pdf`** — the structural/content template: a title page, an agenda page (4 fixed items), then four repeating "section divider + content" pairs (01 ผลการดำเนินงาน / Results, 02 ประเด็นปัญหาและความเสี่ยง / Issues & Risks, 03 ประเด็นเพื่อหารือ / Decisions, 04 การดำเนินการลำดับถัดไป / Next Steps with the Activities calendar), and a closing contact page.
- **`RAM_Interactive_Executive_Dashboard_v3_fixed.html`** — the visual/layout reference: KPMG blue/pink color scheme, card-based KPI tiles, section-divider slide styling, `@media print { .slide { page-break-after: always } }` pattern already proven in that file for turning an HTML slide deck into a paginated PDF via the browser's native print dialog.

Per the user's instruction, page *content* comes from the PDF's structure and real project data; page *visual style* (cards, colors, typography, divider-slide look) comes from the HTML reference — nothing is invented beyond what's needed to connect the two to live data.

## 2. Page-by-Page Mapping

| # | Page | Content source |
|---|---|---|
| 1 | Title | Project name, "Progress Meeting", current status date (all already available via `project.meta`) |
| 2 | Agenda | Static 4-item list, generated from the four section titles below (not user-editable data, just a fixed template page) |
| 3 | Divider "01 ผลการดำเนินงาน" | Static divider (title only) |
| 4 | ผลการดำเนินงาน content | Reuses the existing Executive Summary report content already in `reports.js` (KPI tiles: Actual/Planned/Variance/Delayed/Complete/Milestones→Deliverables, plus the delayed-task list) |
| 5 | Divider "02 ประเด็นปัญหาและความเสี่ยง" | Static divider |
| 6 | Issues & Risks content | `project.issues` and `project.risks` (from the Issues/Risks/Decisions tab spec), rendered as two short tables |
| 7 | Divider "03 ประเด็นเพื่อหารือ" | Static divider |
| 8 | Decisions content | `project.decisions` (same source spec), rendered as a table |
| 9 | Divider "04 การดำเนินการลำดับถัดไป" | Static divider |
| 10 | Next Steps calendar | The Activities tab's calendar-layout function (from the Activities spec), rendered for the current + next month |
| 11 | Closing | Simple "Thank you" / project name footer — no KPMG-specific legal/contact boilerplate (that's firm branding, out of scope for a generic PM tool; see §5) |

## 3. PDF Export Mechanism

No external dependency is available (zero-dependency rule), so PDF generation reuses the same technique already proven in the reference HTML: each report page is a `<section class="report-page">` in the DOM, a `@media print` stylesheet gives each one `page-break-after: always` and hides all app chrome (sidebar, toolbar, tab bar), and the "Export PDF" button simply calls `window.print()` — the browser's native print dialog (with "Save as PDF") produces the multi-page PDF matching the page sequence in §2. This is consistent with `layout.css`'s existing `@media print` rules for the rest of the app.

## 4. Testing

- Page-mapping/data-assembly logic (which tasks/issues/risks/decisions/activities appear on which page) should be pure functions in `reports.js` or a new engine-side helper, Node-tested directly against fixture data for each of the 4 content pages (3, so results/issues&risks/decisions/calendar).
- UI: controller-run Playwright checks — open the Reports tab, confirm all 11 pages render in order with real seeded data (at least one issue, one risk, one decision, one meeting, one workshop), confirm the print stylesheet hides app chrome and paginates correctly (checked via the browser's print-preview, same technique used for the existing Copy-as-Image / S-Curve print checks earlier this project), and confirm "Export PDF" triggers `window.print()`.

## 5. Out of Scope

- KPMG-specific legal/contact/social-media boilerplate on the closing page — deliberately left out; not generic-tool content.
- Any interactivity in the exported PDF (it's a static print artifact, same as any other PDF).
- Any change to the Issues/Risks/Decisions or Activities tabs' own data model or UI — this spec only consumes what those two specs produce.
