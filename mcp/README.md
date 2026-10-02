# @floor1/mcp

An MCP server that lets AI agents quote, buy, sell and launch Floor1 tokens on Giwa Sepolia (chain 91342). It runs locally over stdio, builds every transaction with `@floor1/sdk`, and signs with a key you control. Floor1 never holds your key.

[Documentation](https://docs.floor1.fun/mcp/)

## Add it to an agent

```sh
claude mcp add floor1 \
  -e FLOOR1_PRIVATE_KEY=0x… \
  -e FLOOR1_RPC_URL=https://your-giwa-sepolia-rpc \
  -- npx -y @floor1/mcp
```

Any MCP client that launches stdio servers works the same way: run `npx -y @floor1/mcp` with the environment below. Use a dedicated testnet wallet holding only what the agent may spend.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `FLOOR1_PRIVATE_KEY` | none | Signing key. Without it the server is prepare-only: write tools return unsigned transactions. |
| `FLOOR1_RPC_URL` | none | Giwa Sepolia RPC endpoint, required for balances, sends and receipts. The server refuses an endpoint on another chain. |
| `FLOOR1_API_URL` | `https://www.floor1.fun` | Floor1 API origin for quotes and market reads. |
| `FLOOR1_MAX_BUY_ETH` | `0.1` | Largest single buy. |
| `FLOOR1_DAILY_MAX_ETH` | `1` | Total ETH buys may spend in any rolling 24 hours. |
| `FLOOR1_MAX_SLIPPAGE_BPS` | `500` | Highest slippage a tool call may request. Calls default to 100. |
| `FLOOR1_TOKEN_ALLOWLIST` | none | Comma-separated token addresses. When set, buy, sell and approve accept only these tokens. |
| `FLOOR1_MAX_TX_PER_MINUTE` | `6` | Transactions per minute. |
| `FLOOR1_ARWEAVE_ALLOW_PAID` | off | Set to `1` to allow paid Arweave uploads once the free allowance is used. |

## Tools

| Tool | Kind | What it does |
| --- | --- | --- |
| `floor1_quote` | read | Exact-input buy or sell quote. |
| `floor1_balances` | read | ETH balance, token balance and market allowance. |
| `floor1_search_tokens` | read | Search tokens by ticker or name. |
| `floor1_token` | read | One token's prices, supply, holders and 24-hour stats. |
| `floor1_tx_status` | read | Pending, success or reverted, with the decoded revert and the fill. |
| `floor1_buy` | write | Buy with ETH, wait for the receipt, report the tokens received. |
| `floor1_approve` | write | Approve the market for an exact token amount. |
| `floor1_sell` | write | Sell an approved amount for ETH. Never approves on its own. |
| `floor1_mint` | write | Upload image and metadata to Arweave, launch the token, return its address. |

Amounts are decimal strings in whole units, such as `"0.01"` ETH or `"250"` tokens. Every write tool accepts `dry_run: true` to return the quote and unsigned transaction without sending anything. Write tools carry the MCP `destructiveHint`, so clients ask before running them.

## Limits

The server refuses rather than queues when an agent calls too fast:

- Quotes: 2 per second, bursts of 5.
- Token search and token details: 2 per second, identical reads cached for 5 seconds.
- Transactions: one in flight per wallet, `FLOOR1_MAX_TX_PER_MINUTE` per minute.
- Launches: one per minute.
- When the Floor1 API answers 429, the server waits for `Retry-After` once (up to 10 seconds), retries once, then returns the error.

## Arweave uploads

`floor1_mint` uploads through Turbo, signed by the configured wallet. Uploads are free up to 105 KiB per item, but the free allowance is capped at 10 MiB per wallet and 10 MiB per network address over their lifetime, which is roughly 100 launches with full-size images. Before the first upload the server checks the wallet's remaining free bytes for both files and refuses the launch if they do not fit, unless `FLOOR1_ARWEAVE_ALLOW_PAID=1` is set and the wallet has Turbo credits. Images must be PNG, JPEG or WebP and at most 96 KB. If the upload succeeds but the launch fails, the error includes the metadata URI so a retry can pass `metadata_uri` instead of uploading again.
