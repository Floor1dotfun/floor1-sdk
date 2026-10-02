import type { WalletClient } from "viem";
import { giwaSepolia } from "./contracts.ts";
import { Floor1Error } from "./errors.ts";
import { prepareBuy, prepareMint, prepareSell, validateQuote, validateQuoteParams } from "./transactions.ts";
import type { Floor1ClientOptions, MintParams, PreparedTransaction, Quote, QuoteParams, RequestOptions, SendOptions, TradeParams, TradeResult } from "./types.ts";

export function createFloor1Client(options: Floor1ClientOptions = {}) {
  const base = new URL(options.baseUrl ?? "https://www.floor1.fun");
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) throw new Floor1Error("invalid_url", "Use an HTTPS API origin or a local HTTP origin.");
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Floor1Error("invalid_url", "Use an API origin without credentials, query, fragment, or path.");
  const fetcher = options.fetch ?? globalThis.fetch;

  async function quote(params: QuoteParams, request: RequestOptions = {}): Promise<Quote> {
    const body = validateQuoteParams(params);
    let response: Response;
    try {
      response = await fetcher(new URL("/api/v1/trading/quotes", base), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: request.signal, credentials: "omit", cache: "no-store" });
    } catch (error) {
      if (request.signal?.aborted || error instanceof Error && error.name === "AbortError") throw error;
      throw new Floor1Error("network", "The quote request could not reach Floor1.");
    }
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const failure = data as { error?: { code?: unknown; message?: unknown } } | null;
      const retry = Number(response.headers.get("Retry-After") ?? NaN);
      throw new Floor1Error(typeof failure?.error?.code === "string" ? failure.error.code : "unavailable", typeof failure?.error?.message === "string" ? failure.error.message : "The quote request failed.", response.status, Number.isFinite(retry) && retry > 0 ? retry : undefined);
    }
    return validateQuote(data, body);
  }

  function walletFor(send: SendOptions) {
    const wallet: WalletClient | undefined = send.wallet ?? options.wallet;
    if (!wallet) throw new Floor1Error("wallet_required", "Provide a connected wallet to send a transaction.");
    if (wallet.chain?.id !== giwaSepolia.chainId) throw new Floor1Error("wrong_chain", "Switch the wallet to Giwa Sepolia (91342).");
    const account = send.account ?? wallet.account;
    if (!account) throw new Floor1Error("account_required", "Connect a wallet account first.");
    return { wallet, account };
  }

  function sendTransaction(tx: PreparedTransaction, send: SendOptions) {
    const { wallet, account } = walletFor(send);
    if (send.signal?.aborted) throw send.signal.reason;
    return wallet.sendTransaction({ account, chain: wallet.chain, to: tx.to, data: tx.data, value: tx.value });
  }

  async function trade(side: "buy" | "sell", params: TradeParams, send: SendOptions): Promise<TradeResult> {
    walletFor(send);
    const result = await quote({ ...params, side }, send);
    const hash = await sendTransaction(side === "buy" ? prepareBuy(result) : prepareSell(result), send);
    return { hash, quote: result };
  }

  return {
    quote,
    buy: (params: TradeParams, send: SendOptions = {}) => trade("buy", params, send),
    sell: (params: TradeParams, send: SendOptions = {}) => trade("sell", params, send),
    mint: (params: MintParams, send: SendOptions = {}) => sendTransaction(prepareMint(params), send),
  };
}
