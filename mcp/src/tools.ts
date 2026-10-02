import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Floor1Error, giwaSepolia, parseMintReceipt, parseTradeReceipt, prepareBuy, prepareMint, prepareSell, prepareSellApproval, tradingAbi, type PreparedTransaction, type Quote } from "@floor1/sdk";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isAddress, isAddressEqual, parseEventLogs, type Address, type Hash, type TransactionReceipt } from "viem";
import { z } from "zod";
import { display, parseAmount } from "./amounts.ts";
import type { Api } from "./api.ts";
import { buildMetadata, checkImage, IMAGE_MAX_BYTES, validateDraft, type createUploader } from "./arweave.ts";
import type { Chain } from "./chain.ts";
import type { Config } from "./config.ts";
import { McpError } from "./errors.ts";
import { singleFlight, slidingWindow, spendLedger } from "./limits.ts";

type Uploader = ReturnType<typeof createUploader>;
type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

const json = (value: unknown) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);

const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const write = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const;

const tokenInput = z.string().describe("Token contract address (0x…).");
const slippageInput = z.number().int().optional().describe("Slippage tolerance in basis points (100 = 1%). Defaults to 100.");
const dryRunInput = z.boolean().optional().describe("Return the quote and unsigned transaction without sending anything.");

const unsigned = (tx: PreparedTransaction) => ({ chainId: tx.chainId, to: tx.to, data: tx.data, value: tx.value.toString() });
const quoteView = (quote: Quote) => ({ id: quote.id, token: quote.token, side: quote.side, amountIn: quote.amount, amountInDisplay: display(quote.amount), amountOut: quote.amountOut, amountOutDisplay: display(quote.amountOut), minimumOut: quote.minimumOut, minimumOutDisplay: display(quote.minimumOut), fee: quote.fee, refund: quote.refund, slippageBps: quote.slippageBps, expiresAt: new Date(quote.expiresAt).toISOString(), indexedBlock: quote.snapshot.blockNumber, units: quote.side === "buy" ? "ETH in, tokens out" : "tokens in, ETH out" });
const explorer = (hash: Hash) => `${giwaSepolia.explorerUrl}/tx/${hash}`;

function fillView(receipt: TransactionReceipt, token: Address | null) {
  const trade = token ? parseTradeReceipt(receipt.logs, token, receipt.from) : null;
  if (trade) return { kind: "trade", ...trade, amountOutDisplay: display(trade.amountOut), quoteAmountDisplay: display(trade.quoteAmount), tokenAmountDisplay: display(trade.tokenAmount) };
  const mint = parseMintReceipt(receipt.logs);
  return mint ? { kind: "mint", ...mint } : null;
}

export function registerTools(server: McpServer, deps: { config: Config; api: Api; chain: Chain; uploader: Uploader; redact: (text: string) => string }) {
  const { config, api, chain, uploader, redact } = deps;
  const ok = (value: unknown): Result => ({ content: [{ type: "text", text: redact(json(value)) }] });
  const flight = singleFlight();
  const txWindow = slidingWindow("transactions", config.maxTxPerMinute, 60_000);
  const mintWindow = slidingWindow("mints", 1, 60_000);
  const spend = spendLedger(config.dailyMaxWei);
  const signer = chain.address;
  const mode = signer ? "signing" : "prepare_only";

  const token = (value: string, trading = true) => {
    if (!isAddress(value, { strict: false }) || isAddressEqual(value, "0x0000000000000000000000000000000000000000")) throw new McpError("invalid_token", "Use a nonzero token contract address.");
    if (trading && config.allowlist && !config.allowlist.includes(value.toLowerCase() as Address)) throw new McpError("token_not_allowed", "This token is not in FLOOR1_TOKEN_ALLOWLIST.");
    return value as Address;
  };
  const slippage = (value: number | undefined) => {
    const bps = value ?? config.defaultSlippageBps;
    if (bps > config.maxSlippageBps) throw new McpError("slippage_cap", `Slippage ${bps} bps exceeds the configured maximum of ${config.maxSlippageBps} bps.`);
    if (bps < 10) throw new McpError("invalid_slippage", "Slippage must be at least 10 basis points.");
    return bps;
  };

  async function sendTracked(tx: PreparedTransaction, after: (receipt: TransactionReceipt) => void = () => {}) {
    txWindow.check();
    txWindow.record();
    const sent = await chain.send(tx);
    if (sent.receipt.status === "success") after(sent.receipt);
    return sent;
  }

  async function guard<T>(run: () => Promise<T>): Promise<Result> {
    try { return ok(await run()); }
    catch (error) {
      const known = error instanceof McpError ? { code: error.code, message: error.message, ...error.details }
        : error instanceof Floor1Error ? { code: error.code, message: error.message, ...(error.status ? { status: error.status } : {}), ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) }
        : { code: "internal", message: "The tool failed unexpectedly." };
      return { content: [{ type: "text", text: redact(json({ error: known })) }], isError: true };
    }
  }

  server.registerTool("floor1_quote", {
    title: "Quote a Floor1 trade",
    description: "Get an exact-input quote for buying a Floor1 token with ETH or selling it for ETH on Giwa Sepolia. Amounts are decimal strings in whole units (ETH for buys, tokens for sells). Read only.",
    inputSchema: { token: tokenInput, side: z.enum(["buy", "sell"]), amount: z.string().describe("Exact input as a decimal string, e.g. \"0.01\"."), slippage_bps: slippageInput },
    annotations: read,
  }, args => guard(async () => quoteView(await api.quote({ token: token(args.token, false), side: args.side, amount: parseAmount(args.amount), slippageBps: slippage(args.slippage_bps) }))));

  server.registerTool("floor1_balances", {
    title: "Floor1 balances",
    description: "Read the native ETH balance of an address and, when a token is given, its token balance and the allowance the Floor1 market may spend. Defaults to the configured wallet. Read only.",
    inputSchema: { address: z.string().optional().describe("Address to inspect. Defaults to the configured wallet."), token: z.string().optional().describe("Optional token contract address.") },
    annotations: read,
  }, args => guard(async () => {
    const owner = args.address ?? signer;
    if (!owner || !isAddress(owner, { strict: false })) throw new McpError("address_required", "Pass an address, or set FLOOR1_PRIVATE_KEY to use the configured wallet.");
    const tokenAddress = args.token ? token(args.token, false) : undefined;
    const balances = await chain.balances(owner as Address, tokenAddress);
    return { address: owner, eth: balances.native, ethDisplay: display(balances.native), ...(tokenAddress ? { token: tokenAddress, tokenBalance: balances.token, tokenBalanceDisplay: display(balances.token!), marketAllowance: balances.allowance, marketAllowanceDisplay: display(balances.allowance!) } : {}) };
  }));

  server.registerTool("floor1_buy", {
    title: "Buy a Floor1 token",
    description: `Buy a Floor1 token with native ETH. Requests a fresh quote, enforces the per-trade cap (${display(config.maxBuyWei)} ETH), the rolling 24-hour cap (${display(config.dailyMaxWei)} ETH) and the slippage cap (${config.maxSlippageBps} bps), sends the transaction and waits for the receipt. Without a configured key, returns the unsigned transaction.`,
    inputSchema: { token: tokenInput, amount_eth: z.string().describe("ETH to spend as a decimal string, e.g. \"0.01\"."), slippage_bps: slippageInput, dry_run: dryRunInput },
    annotations: write,
  }, args => guard(async () => {
    const address = token(args.token);
    const amount = parseAmount(args.amount_eth, "amount_eth");
    const bps = slippage(args.slippage_bps);
    if (amount > config.maxBuyWei) throw new McpError("buy_cap", `This buy exceeds the per-trade cap of ${display(config.maxBuyWei)} ETH (FLOOR1_MAX_BUY_ETH).`);
    if (amount > spend.remaining()) throw new McpError("daily_cap", `This buy exceeds the remaining 24-hour allowance of ${display(spend.remaining())} ETH (FLOOR1_DAILY_MAX_ETH).`);
    const quote = await api.quote({ token: address, side: "buy", amount, slippageBps: bps });
    const tx = prepareBuy(quote);
    if (args.dry_run || !signer) return { mode: args.dry_run ? "dry_run" : mode, sent: false, quote: quoteView(quote), transaction: unsigned(tx) };
    return flight(async () => {
      if (amount > spend.remaining()) throw new McpError("daily_cap", `This buy exceeds the remaining 24-hour allowance of ${display(spend.remaining())} ETH.`);
      const sent = await sendTracked(tx, () => spend.record(amount));
      return { mode, sent: true, status: sent.receipt.status, hash: sent.hash, explorer: explorer(sent.hash), revert: sent.revert, quote: quoteView(quote), fill: fillView(sent.receipt, address), dailyRemainingEth: display(spend.remaining()) };
    });
  }));

  server.registerTool("floor1_approve", {
    title: "Approve Floor1 market to sell a token",
    description: "Approve the Floor1 bonding market to spend an exact amount of a token so it can be sold. Never approves more than requested. Sends a transaction unless dry_run is set or no key is configured.",
    inputSchema: { token: tokenInput, amount: z.string().describe("Token amount to approve as a decimal string."), dry_run: dryRunInput },
    annotations: write,
  }, args => guard(async () => {
    const address = token(args.token);
    const tx = prepareSellApproval(address, parseAmount(args.amount));
    if (args.dry_run || !signer) return { mode: args.dry_run ? "dry_run" : mode, sent: false, transaction: unsigned(tx) };
    return flight(async () => {
      const sent = await sendTracked(tx);
      return { mode, sent: true, status: sent.receipt.status, hash: sent.hash, explorer: explorer(sent.hash), revert: sent.revert, spender: giwaSepolia.market, amount: args.amount };
    });
  }));

  server.registerTool("floor1_sell", {
    title: "Sell a Floor1 token",
    description: `Sell an exact amount of a Floor1 token for native ETH. Checks balance and market allowance first (call floor1_approve if needed; it never approves on its own), requests a fresh quote within the ${config.maxSlippageBps} bps slippage cap, sends the transaction and waits for the receipt.`,
    inputSchema: { token: tokenInput, amount: z.string().describe("Token amount to sell as a decimal string."), slippage_bps: slippageInput, dry_run: dryRunInput },
    annotations: write,
  }, args => guard(async () => {
    const address = token(args.token);
    const amount = parseAmount(args.amount);
    const bps = slippage(args.slippage_bps);
    if (signer) {
      const balances = await chain.balances(signer, address);
      if (balances.token! < amount) throw new McpError("insufficient_balance", `The wallet holds ${display(balances.token!)} tokens, less than ${args.amount}.`);
      if (balances.allowance! < amount) throw new McpError("insufficient_allowance", `The market may spend ${display(balances.allowance!)} tokens. Call floor1_approve for at least ${args.amount} first.`, { allowance: balances.allowance!.toString() });
    }
    const quote = await api.quote({ token: address, side: "sell", amount, slippageBps: bps });
    const tx = prepareSell(quote);
    if (args.dry_run || !signer) return { mode: args.dry_run ? "dry_run" : mode, sent: false, quote: quoteView(quote), transaction: unsigned(tx), ...(signer ? {} : { note: "Allowance was not checked because no key is configured." }) };
    return flight(async () => {
      const sent = await sendTracked(tx);
      return { mode, sent: true, status: sent.receipt.status, hash: sent.hash, explorer: explorer(sent.hash), revert: sent.revert, quote: quoteView(quote), fill: fillView(sent.receipt, address) };
    });
  }));

  server.registerTool("floor1_mint", {
    title: "Launch a Floor1 token",
    description: `Launch a new Floor1 token. Uploads the image (PNG, JPEG or WebP, at most ${IMAGE_MAX_BYTES} bytes) and metadata to Arweave with the configured wallet, using the free Turbo allowance unless FLOOR1_ARWEAVE_ALLOW_PAID=1, then sends the launch transaction and returns the new token address. Pass metadata_uri instead of image_path to reuse metadata you already uploaded. Limited to one launch per minute.`,
    inputSchema: {
      name: z.string().describe("Token name, 1 to 32 characters."),
      symbol: z.string().describe("Ticker, 1 to 10 uppercase letters or numbers."),
      description: z.string().optional().describe("Up to 500 characters."),
      website: z.string().optional().describe("https:// link."),
      x: z.string().optional().describe("https://x.com link."),
      telegram: z.string().optional().describe("https://t.me link."),
      image_path: z.string().optional().describe("Local path to the token image."),
      metadata_uri: z.string().optional().describe("ar:// URI of metadata already uploaded. Skips the upload."),
      creator_tax_bps: z.number().int().optional().describe("Creator tax on every trade, 0 to 1000 basis points. Defaults to 0."),
      dry_run: dryRunInput,
    },
    annotations: write,
  }, args => guard(async () => {
    const draft = { name: args.name, symbol: args.symbol, description: args.description, website: args.website, x: args.x, telegram: args.telegram };
    validateDraft(draft);
    if (args.metadata_uri) {
      const tx = prepareMint({ name: args.name, symbol: args.symbol, metadataUri: args.metadata_uri as `ar://${string}`, creatorTaxBps: args.creator_tax_bps });
      if (args.dry_run || !signer) return { mode: args.dry_run ? "dry_run" : mode, sent: false, metadataUri: args.metadata_uri, transaction: unsigned(tx) };
      return flight(async () => {
        mintWindow.check();
        mintWindow.record();
        const sent = await sendTracked(tx);
        return { mode, sent: true, status: sent.receipt.status, hash: sent.hash, explorer: explorer(sent.hash), revert: sent.revert, metadataUri: args.metadata_uri, launched: parseMintReceipt(sent.receipt.logs) };
      });
    }
    if (!args.image_path) throw new McpError("image_required", "Pass image_path for a new upload, or metadata_uri for metadata you already uploaded.");
    if (!signer) throw new McpError("signer_required", "Uploading needs FLOOR1_PRIVATE_KEY to sign. Upload the metadata yourself and pass metadata_uri to get an unsigned launch transaction.");
    const path = resolve(args.image_path);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw new McpError("invalid_image", "image_path does not point to a readable file.");
    if (info.size > IMAGE_MAX_BYTES) throw new McpError("invalid_image", `The image is ${info.size} bytes; the limit is ${IMAGE_MAX_BYTES} bytes (96 KB). Compress it first.`);
    const image = new Uint8Array(await readFile(path));
    const contentType = checkImage(image);
    const placeholder = buildMetadata(draft, `ar://${"x".repeat(43)}`);
    const metadataSize = new TextEncoder().encode(JSON.stringify(placeholder)).length;
    prepareMint({ name: args.name, symbol: args.symbol, metadataUri: `ar://${"x".repeat(43)}`, creatorTaxBps: args.creator_tax_bps });
    const upload = await uploader.plan([image.length, metadataSize]);
    if (args.dry_run) return { mode: "dry_run", sent: false, uploaded: false, image: { bytes: image.length, contentType }, metadata: placeholder, upload };
    return flight(async () => {
      mintWindow.check();
      txWindow.check();
      mintWindow.record();
      const imageUri = await uploader.upload(image, contentType, "token-image");
      const metadata = buildMetadata(draft, imageUri);
      const metadataUri = await uploader.upload(new TextEncoder().encode(JSON.stringify(metadata)), "application/json", "token-metadata");
      try {
        const sent = await sendTracked(prepareMint({ name: args.name, symbol: args.symbol, metadataUri, creatorTaxBps: args.creator_tax_bps }));
        return { mode, sent: true, status: sent.receipt.status, hash: sent.hash, explorer: explorer(sent.hash), revert: sent.revert, imageUri, metadataUri, upload, launched: parseMintReceipt(sent.receipt.logs) };
      } catch (error) {
        if (error instanceof McpError) throw new McpError(error.code, `${error.message} The metadata is already uploaded; retry with metadata_uri ${metadataUri}.`, { ...error.details, imageUri, metadataUri });
        throw error;
      }
    });
  }));

  server.registerTool("floor1_tx_status", {
    title: "Floor1 transaction status",
    description: "Look up a transaction on Giwa Sepolia: pending, success or reverted, with the decoded Floor1 revert reason and any trade fill or launched token. Read only.",
    inputSchema: { hash: z.string().describe("Transaction hash (0x…).") },
    annotations: read,
  }, args => guard(async () => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(args.hash)) throw new McpError("invalid_hash", "Use a 32-byte transaction hash.");
    const status = await chain.status(args.hash as Hash);
    if (!status.receipt) return { hash: args.hash, state: status.state };
    const trade = parseEventLogs({ abi: tradingAbi, eventName: "Trade", logs: status.receipt.logs.filter(log => isAddressEqual(log.address, giwaSepolia.market)) })[0];
    return { hash: args.hash, state: status.state, explorer: explorer(args.hash as Hash), blockNumber: status.receipt.blockNumber, gasUsed: status.receipt.gasUsed, revert: status.revert, fill: fillView(status.receipt, trade?.args.token ?? null) };
  }));

  server.registerTool("floor1_search_tokens", {
    title: "Search Floor1 tokens",
    description: "Search Floor1 tokens by ticker prefix or name. Returns addresses, prices in ETH and USD, market caps, 24-hour change and holder counts. Read only.",
    inputSchema: { query: z.string().describe("Ticker or name, 1 to 64 characters."), limit: z.number().int().min(1).max(20).optional().describe("Maximum results, 1 to 20. Defaults to 10.") },
    annotations: read,
  }, args => guard(async () => ({ items: await api.search(args.query, args.limit ?? 10) })));

  server.registerTool("floor1_token", {
    title: "Floor1 token details",
    description: "Read one Floor1 token: name, ticker, supply, prices, market cap, holders, graduation state and 24-hour stats. Read only.",
    inputSchema: { token: tokenInput },
    annotations: read,
  }, args => guard(async () => api.token(args.token)));
}
