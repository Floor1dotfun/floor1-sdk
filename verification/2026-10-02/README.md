# Docs search metadata verification — 2 October 2026

Adds per-page search titles and descriptions, Open Graph and X cards, `TechArticle`/`BreadcrumbList` structured data (plus `WebSite` and `SoftwareSourceCode` on the overview), sitemap `lastmod`, an IndexNow key file, a noindex 404, links to the www.floor1.fun Giwa guides from the network page, and fixes the page-source link to `main`.

Failure scenarios were recorded first in `tests/FAILURE-SCENARIOS.md` (Search metadata). The full suite passed: 31 checks plus the consumer typecheck, including "Every page has distinct search metadata, structured data and a matching sitemap".

Reproduce from this repository with Node.js 20+ and npm:

```sh
npm ci
npx playwright install chromium
npm run e2e
```

Artifacts: `report.json`, `seo.json` (per-page title, description, canonical and schema types), `sitemap.xml`, `desktop-dark.png`, `mobile-mint.png`, `trace.zip`.
