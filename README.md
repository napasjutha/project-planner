# ProjectPlanner

A single-file HTML project-planning app. No install, no server, no dependencies — open the file in a browser and it works.

Built for consulting engagements that need real WBS/Gantt tracking (holiday-aware durations, S-curve progress, resourcing, billing milestones) without standing up infrastructure or asking a client to install anything. Copy the built HTML file, hand it to whoever needs it, done.

## Features

- **Plan** — hierarchical WBS tree, inline editing, drag-based indent/outdent, CSV import/export, predecessor dependencies
- **Gantt** — drag to move/resize, critical path, dependency arrows
- **S-Curve** — planned vs. actual progress, snapshot overlays
- **Dashboard** — rollup KPIs, delayed/blocked breakdowns
- **Resources** — PIC capacity vs. workload, per-week demand
- **Deliverable/Billing** — many-to-one deliverables → billing milestones
- **Activities** — meeting/workshop calendar with drag-to-move, CSV mass upload
- **Issues, Risks & Decisions** — independent tracked collections
- **Reports** — 4-section dashboard (Executive Summary, Progress Roadmap, Weekly Actions, Risks & Detail), export any section as an image
- **Settings** — CSV and formatted-Excel export, theme, audit log
- Full undo/redo, snapshots, holiday calendar, multi-user attribution

## Getting started

```bash
git clone https://github.com/promprit/project-planner.git
cd project-planner
python3 build.py        # builds dist/ProjectPlanner.html
node --test              # runs the engine test suite
```

Open `dist/ProjectPlanner.html` directly in a browser — that's the whole app.

## Architecture

- `src/` builds into a single `dist/ProjectPlanner.html` via `build.py`. Zero external dependencies, ever — no npm packages, no CDN, no bundler.
- `src/js/*.js` — engines: pure logic (scheduling, calculations, CSV, snapshots), no DOM, Node-tested.
- `src/js/ui/*.js` — UI: DOM rendering and event wiring, no automated tests, verified in a real browser.
- `tests/` — `node --test`, no test framework dependency.
- `docs/superpowers/` — design specs and implementation plans for every feature, in the order they were built.

## Data

Project data lives in the browser (`localStorage`) and in `.json` files you explicitly save/load — nothing is sent anywhere. The built HTML file is the entire application; a saved `.json` is the entire project's data. Keep both, hand off either.
