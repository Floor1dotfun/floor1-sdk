import { decodeErrorResult, encodeFunctionData, isAddress, isAddressEqual, parseEventLogs, type Address, type Hex, type Log } from "viem";
import { approvalAbi, giwaSepolia, mintingAbi, tradingAbi } from "./contracts.ts";
import { Floor1Error } from "./errors.ts";
import type { MintParams, PreparedTransaction, Quote, QuoteParams } from "./types.ts";

export const MAX_UINT256 = 2n ** 256n - 1n;

export function assertAmount(amount: bigint, allowZero = false) {
  if (typeof amount !== "bigint" || amount < (allowZero ? 0n : 1n) || amount > MAX_UINT256) throw new Floor1Error("invalid_amount", "Use an atomic-unit bigint within uint256 bounds.");
}

export function validateQuoteParams(params: QuoteParams) {
  if (!isAddress(params.token, { strict: false }) || isAddressEqual(params.token, "0x0000000000000000000000000000000000000000")) throw new Floor1Error("invalid_token", "Use a nonzero token contract address.");
  if (params.side !== "buy" && params.side !== "sell") throw new Floor1Error("invalid_side", "Choose buy or sell.");
  assertAmount(params.amount);
  const slippageBps = params.slippageBps ?? 100;
  if (!Number.isInteger(slippageBps) || slippageBps < 10 || slippageBps > 5_000) throw new Floor1Error("invalid_slippage", "Slippage must be between 10 and 5000 basis points.");
  return { token: params.token, side: params.side, amount: params.amount.toString(), slippageBps };
}

const atomic = (value: unknown) => typeof value === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value) <= MAX_UINT256;
const timestamp = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function validateQuote(value: unknown, expected?: ReturnType<typeof validateQuoteParams>): Quote {
  if (!value || typeof value !== "object") throw new Floor1Error("invalid_response", "The quote response is invalid.");
  const q = value as Quote;
  const malformed = () => { throw new Floor1Error("invalid_response", "The quote response is invalid."); };
  if (typeof q.id !== "string" || !q.id || q.chainId !== giwaSepolia.chainId || q.mode !== "exact_in" || typeof q.token !== "string" || !isAddress(q.token, { strict: false })) malformed();
  if (q.side !== "buy" && q.side !== "sell") malformed();
  if (![q.amount, q.amountOut, q.minimumOut, q.fee, q.protocolFee, q.creatorFee].every(atomic)) malformed();
  if (!Number.isInteger(q.slippageBps) || q.slippageBps < 10 || q.slippageBps > 5_000 || !timestamp(q.issuedAt) || !timestamp(q.expiresAt) || q.expiresAt <= q.issuedAt || q.expiresAt - q.issuedAt > 30_000 || q.issuedAt > Date.now() + 5_000) malformed();
  if (!q.snapshot || q.snapshot.source !== "database" || !timestamp(q.snapshot.blockNumber) || !timestamp(q.snapshot.indexedAt) || !timestamp(q.snapshot.marketVersion)) malformed();
  if (BigInt(q.amount) === 0n || BigInt(q.amountOut) === 0n || BigInt(q.minimumOut) !== BigInt(q.amountOut) * BigInt(10_000 - q.slippageBps) / 10_000n || BigInt(q.fee) !== BigInt(q.protocolFee) + BigInt(q.creatorFee)) malformed();
  if (expected && (!isAddressEqual(q.token, expected.token) || q.side !== expected.side || q.amount !== expected.amount || q.slippageBps !== expected.slippageBps)) malformed();
  if (q.expiresAt <= Date.now()) throw new Floor1Error("quote_expired", "Request a fresh quote before trading.");
  return q;
}

export function prepareBuy(quote: Quote): PreparedTransaction {
  const q = validateQuote(quote);
  if (q.side !== "buy") throw new Floor1Error("invalid_side", "A buy requires a buy quote.");
  return { chainId: giwaSepolia.chainId, to: giwaSepolia.market, data: encodeFunctionData({ abi: tradingAbi, functionName: "buyWithEth", args: [q.token, BigInt(q.minimumOut)] }), value: BigInt(q.amount) };
}

export function prepareSell(quote: Quote): PreparedTransaction {
  const q = validateQuote(quote);
  if (q.side !== "sell") throw new Floor1Error("invalid_side", "A sell requires a sell quote.");
  return { chainId: giwaSepolia.chainId, to: giwaSepolia.market, data: encodeFunctionData({ abi: tradingAbi, functionName: "sellToEth", args: [q.token, BigInt(q.amount), BigInt(q.minimumOut)] }), value: 0n };
}

export function prepareSellApproval(token: Address, amount: bigint): PreparedTransaction {
  validateQuoteParams({ token, side: "sell", amount });
  return { chainId: giwaSepolia.chainId, to: token, data: encodeFunctionData({ abi: approvalAbi, functionName: "approve", args: [giwaSepolia.market, amount] }), value: 0n };
}

export function prepareMint(params: MintParams): PreparedTransaction {
  const name = params.name.trim();
  const fee = params.creatorFeeShareBps ?? 0;
  if (!name || name.length > 32 || !/^[A-Z0-9]{1,10}$/.test(params.symbol)) throw new Floor1Error("invalid_metadata", "Use a name of 1–32 characters and a ticker of 1–10 uppercase letters or numbers.");
  if (!/^ar:\/\/[A-Za-z0-9_-]{43}$/.test(params.metadataUri)) throw new Floor1Error("invalid_metadata", "Upload metadata to Arweave and pass its ar:// transaction URI.");
  if (!Number.isInteger(fee) || fee < 0 || fee > 10_000) throw new Floor1Error("invalid_creator_fee", "Creator fee share must be between 0 and 10000 basis points.");
  return { chainId: giwaSepolia.chainId, to: giwaSepolia.factory, data: encodeFunctionData({ abi: mintingAbi, functionName: "launch", args: [name, params.symbol, giwaSepolia.weth, params.metadataUri, fee] }), value: 0n };
}

export function parseMintReceipt(logs: readonly Log[]) {
  const [event] = parseEventLogs({ abi: mintingAbi, eventName: "Launched", logs: logs.filter(log => isAddressEqual(log.address, giwaSepolia.factory)) });
  return event ? { token: event.args.token, creator: event.args.creator, name: event.args.name, symbol: event.args.symbol, metadataUri: event.args.metadataURI, supply: event.args.supply, creatorFeeShareBps: event.args.creatorFeeShareBps } : null;
}

export function decodeFloor1Revert(data: Hex) {
  for (const abi of [tradingAbi, mintingAbi]) {
    try { return decodeErrorResult({ abi, data }).errorName; }
    catch { continue; }
  }
  return null;
}
