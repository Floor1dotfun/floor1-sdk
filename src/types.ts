import type { Address, Hex, WalletClient } from "viem";

export type TradeSide = "buy" | "sell";
export type QuoteParams = { token: Address; side: TradeSide; amount: bigint; slippageBps?: number };
export type TradeParams = Omit<QuoteParams, "side">;
export type Quote = {
  id: string;
  chainId: number;
  token: Address;
  side: TradeSide;
  mode: "exact_in";
  amount: string;
  slippageBps: number;
  amountOut: string;
  minimumOut: string;
  fee: string;
  protocolFee: string;
  creatorFee: string;
  issuedAt: number;
  expiresAt: number;
  snapshot: { source: "database"; blockNumber: number; indexedAt: number; marketVersion: number };
};
export type PreparedTransaction = { chainId: number; to: Address; data: Hex; value: bigint };
export type MintParams = { name: string; symbol: string; metadataUri: `ar://${string}`; creatorFeeShareBps?: number };
export type Floor1ClientOptions = { baseUrl?: string; fetch?: typeof globalThis.fetch; wallet?: WalletClient };
export type RequestOptions = { signal?: AbortSignal };
export type SendOptions = RequestOptions & { wallet?: WalletClient; account?: Address };
export type TradeResult = { hash: Hex; quote: Quote };
