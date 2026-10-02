# Agent discovery verification — 2 October 2026

Adds the Market API page, a static OpenAPI 3.1 description at `/openapi.json`, `rel="alternate"` Markdown links on every page, `Accept: text/markdown` negotiation with `Vary: Accept`, `noindex` and a canonical `Link` header on Markdown responses, small favicons, and package keywords.

Failure scenarios were recorded first in `tests/FAILURE-SCENARIOS.md` (Agent discovery). The full suite passed with the live API contract check enabled: 36 checks plus the consumer typecheck.

Reproduce from this repository with Node.js 20+ and npm:

```sh
npm ci
npx playwright install chromium
FLOOR1_LIVE_API=1 npm run e2e
npx -y @redocly/cli@latest lint dist/openapi.json
```

`FLOOR1_LIVE_API=1` sends read-only requests and one quote to https://www.floor1.fun and fails on any response that does not validate against `openapi.json` or carries a field the description does not declare. Omit it to run offline.

The local docs server applies the `rewrites` and `headers` from `vercel.json`. `vercel-routes.json` is the route table `vercel build` compiled from that file: headers run before the filesystem and rewrites after it, which is why the HTML lives under `/_html/` and the public page paths are rewrites.

Artifacts: `report.json`, `openapi.json`, `agent-discovery.json` (per-page HTML and Markdown status and headers), `live-api-contract.json` (live status, cache header and validation per endpoint), `vercel-routes.json`, `market-api-desktop.png`, `market-api-mobile.png`.
