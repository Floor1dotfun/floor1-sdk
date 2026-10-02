# SDK and documentation verification

The release tarball was installed in a clean consumer. The report records its SHA-256. Wallet sends use a deterministic fixture; no real chain transaction was submitted. Screenshots and the Playwright trace cover the built purple docs at desktop and mobile sizes.

Reproduce from this repository with Node.js 20+ and npm:

```sh
npm ci
npx playwright install chromium
npm run e2e
```

Open the saved browser trace:

```sh
npx playwright show-trace verification/2026-10-01/trace.zip
```

Fresh artifacts are written to `test-results/e2e/`.
