# Floor1 SDK

A focused TypeScript SDK for buying, selling, quotes, and minting Floor1 tokens on Giwa Sepolia.

[Documentation](https://docs.floor1.fun) · [npm package](https://www.npmjs.com/package/@floor1/sdk)

v0.1.0 supports Giwa Sepolia (testnet), chain 91342.

```ts
import { createFloor1Client } from '@floor1/sdk';
import { parseEther } from 'viem';

const floor1 = createFloor1Client({ wallet });
const quote = await floor1.quote({ token, side: 'buy', amount: parseEther('0.01') });
const { hash } = await floor1.buy({ token, amount: parseEther('0.01'), slippageBps: 100 });
```

`wallet` is your connected viem WalletClient on chain 91342. Quotes use atomic-unit decimal strings in responses and bigint inputs in the SDK. Trades are exact input. The SDK contains no RPC URLs or RPC client. Wallet broadcasting, receipt confirmation, and metadata uploads use your own providers.

## Scope

- `quote`, `buy`, `sell`, and `mint` on the client.
- `prepareBuy`, `prepareSell`, `prepareSellApproval`, and `prepareMint` for custom transaction senders.
- `parseMintReceipt`, `decodeFloor1Revert`, minimal contract ABIs, and deployment constants.

There are no candles, market feeds, holders, portfolios, token discovery, private APIs, or ingest services. Selling requires an explicit allowance; approval is never automatic. Minting launches a new token using metadata already uploaded to Arweave.

## Develop

```sh
npm ci
npm run build
npm run docs:build
npm run docs:dev
```

Preview: http://127.0.0.1:4173. The static documentation build is prepared for `docs.floor1.fun`. Search, syntax highlighting, copy controls, Markdown exports, responsive navigation, and both themes run locally without third-party scripts.

## Verify

Failure scenarios were recorded before the suite in [tests/FAILURE-SCENARIOS.md](tests/FAILURE-SCENARIOS.md).

```sh
npm ci
npx playwright install chromium
npm run e2e
```

The suite packs the SDK, installs that tarball in a clean temporary consumer, then exercises quote HTTP requests, transaction construction, wallet submission, approvals, mint receipts, and failure handling. Wallet submission is exercised through a deterministic fixture wallet; this suite does not submit real chain transactions. It also runs the built docs at desktop and mobile sizes, checks navigation, search, copying, themes, local links, Markdown exports, and screenshots.

Artifacts: `test-results/e2e/report.json`, `trace.zip`, desktop/mobile screenshots, the exact `.tgz`, its SHA-256, and the fixture HTTP transcript. These are uploaded by CI. Set `FLOOR1_API_URL` and `FLOOR1_TEST_TOKEN` to a local running Floor1 API to additionally exercise a quote against that service.

## Release

Do not publish the private app workspace package. This repository owns the public package.

1. Merge the reviewed SDK and Floor1 API PRs.
2. Deploy the fee-parameter migration and ingest worker before the public quote API. Enrich existing tokens once through the signed internal client. The public endpoint never starts enrichment or falls back to RPC.
3. Run the E2E command against the deployed quote endpoint and an active testnet token.
4. Rebuild the docs for the verified version.
5. Publish the reviewed package from CI using npm trusted publishing, or authenticate with an npm account authorized for `@floor1/sdk`. No npm token is committed.
6. Deploy the static `dist/` documentation build and connect `docs.floor1.fun`. DNS uses Vercel nameservers; do not replace the root domain records.

No workflow in this repository publishes automatically.
