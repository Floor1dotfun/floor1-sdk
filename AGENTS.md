# Public Floor1 SDK

This repository owns the public SDK and the documentation source for docs.floor1.fun. The app's private workspace SDK is a separate package and must remain private.

Expose only quotes, buy, sell, minting, and directly related transaction helpers. Never add candles, feeds, holders, portfolios, internal ingest clients, or RPC URLs. Quotes reach the public quote endpoint; transactions are built locally and signed by the caller's wallet. Minting creates a new token and does not upload metadata.

Keep the approved documentation layout and use Floor1’s purple theme: dark canvas #0b0a10, card #14131d, foreground #f2f0fa, primary #b4a1ff, primary foreground #1b1236, muted foreground #a4a0b6, and purple active surfaces #302941. Light-mode colors must remain in the same purple palette.

Write no comments in code. Record failure scenarios before isolated tests. Prefer E2E tests, retain reports and traces or screenshots, and provide the exact reproduction command. Do not claim a check passed unless it ran successfully.

Use feature branches from the latest origin/main and open PRs against main. Do not merge without approval. The user authorized v0.1.0 npm publication and Vercel deployment on 1 October 2026. Keep npm credentials out of source, logs, and deployment assets. Future releases require an explicit release instruction.
