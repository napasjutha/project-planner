# ProjectPlanner

Single-file HTML project-planning app. `src/` → `python3 build.py` → `dist/ProjectPlanner.html`. Zero external dependencies, ever — no npm packages, no CDN, no bundler.

## Commands
- Build: `python3 build.py` (run after every src/ change before testing in browser)
- Test: `node --test` (bare form — `node --test tests/` throws MODULE_NOT_FOUND on this Node version)
- Manual browser check: `cd dist && python3 -m http.server <port>`, then navigate to it — `file://` URLs are blocked by the Playwright sandbox in this environment

## Conventions
- Engines (`src/js/*.js`, e.g. `calc.js`, `store.js`): UMD-lite wrapper — `module.exports` for Node, attach to `globalThis.PP` for browser. Pure logic, no DOM, Node-tested.
- UI files (`src/js/ui/*.js`): plain IIFEs, no UMD, never required by Node tests. No jsdom (violates zero-dependency) — verified only via real-browser Playwright checks, not automated tests.
- Any user-controlled string (task name, PIC, remarks, holiday label, snapshot note) going into `innerHTML` MUST be escaped (`escapeHtml()` helper) or built via `.textContent`/`createTextNode`. Never concatenate raw strings into `innerHTML`. Caught real XSS bugs this way multiple times.
- Adding a new view tab: must add to ALL THREE places or the tab is clickable but stays blank — `.view-tab[data-view=...]` button, `<div id="...-view">` container, AND `VIEW_IDS` array in `app.js`. This broke silently twice.
- `[hidden]` attribute can be silently overridden by author `display:flex`/`display:grid` CSS rules (browsers prioritize author styles over the UA `[hidden]` default). `theme.css` has `[hidden] { display: none !important; }` specifically to prevent this — don't remove it.
- Clipboard writes (`navigator.clipboard.write`) need a genuine user-gesture-equivalent event. When testing with Playwright, use a real `browser_click`, not a JS-evaluated `.click()`.
- Canvas rasterization of SVG containing `<foreignObject>`: Chromium taints the canvas (blocks `.toBlob()`/`.toDataURL()`) when the SVG is loaded via `blob:` URL, even same-origin. Use a base64 `data:` URI instead — untainted.

## Docs
- Design spec: `docs/superpowers/specs/2026-07-05-project-planner-design.md`
- Implementation plans (one per build phase): `docs/superpowers/plans/`
