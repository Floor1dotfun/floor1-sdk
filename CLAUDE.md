# Floor1 SDK

This repository contains the public `@floor1/sdk` package and the documentation source for docs.floor1.fun.

Expose only quotes, buy, sell, minting, and directly related transaction helpers. Do not add charts, market feeds, holder lists, portfolios, token discovery, server clients, or RPC URLs. Quotes use the public quote endpoint; transactions are built locally and signed by the caller's wallet. Minting creates a new token and does not upload metadata.

Keep the approved documentation layout and use Floor1's purple theme: dark canvas #0b0a10, card #14131d, foreground #f2f0fa, primary #b4a1ff, primary foreground #1b1236, muted foreground #a4a0b6, and purple active surfaces #302941. Light-mode colors must remain in the same purple palette.

Write no comments in code. Record failure scenarios before isolated tests. Prefer E2E tests, retain reports and screenshots, and provide the exact reproduction command. Do not commit traces or logs that contain local file paths. Do not claim a check passed unless it ran successfully.

Use feature branches from the latest origin/main and open PRs against main. Do not merge without approval. Publishing a release requires an explicit release instruction. Keep credentials out of source, logs, and deployment assets.

This repository is public. Operational runbooks, infrastructure details and internal decisions belong in the private Floor1 repository.
