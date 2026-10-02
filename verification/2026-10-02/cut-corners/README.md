# Docs cut-corner verification — 2 October 2026

Restyles docs controls and surfaces to match the Floor1 app's cut-corner design. Corners are square. Buttons and button-like links use a 7px cut (4px for the shortcut key and version badge). Bordered controls draw a 1px diagonal on the cut edge. Guide cards, code blocks, callouts, endpoints, tables and the search dialog use a 12px cut, a primary-tinted edge and primary corner accents. Focus is a 1px primary outline, drawn inside clipped controls. The purple palette is unchanged in both themes.

Failure scenarios were recorded first in `tests/FAILURE-SCENARIOS.md` (Cut corners). The full suite passed all 33 checks, including the consumer typecheck and including "Controls and surfaces use cut corners in both themes". That check asserts square corners, polygon clip paths, corner accents and one shared edge color on the overview, quotes and HTTP pages at 1440×1000 and 390×844 in dark and light themes, with the search dialog open, and a 1px solid focus outline.

Reproduce from this repository with Node.js 20+ and npm:

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm run e2e
```

Screenshots are written to `test-results/e2e/cut-corners/` and copied here: `{desktop,mobile}-{dark,light}-{overview,quotes,http,search}.png`. `report.json` is the run's report. The trace is left out because it contains local paths.
