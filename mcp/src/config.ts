import { isAddress, type Address, type Hex } from "viem";
import { parseAmount } from "./amounts.ts";
import { McpError } from "./errors.ts";

export type Config = {
  privateKey: Hex | null;
  rpcUrl: string | null;
  apiUrl: string | undefined;
  maxBuyWei: bigint;
  dailyMaxWei: bigint;
  maxSlippageBps: number;
  defaultSlippageBps: number;
  allowlist: Address[] | null;
  allowPaidUploads: boolean;
  maxTxPerMinute: number;
  turboUploadUrl: string | undefined;
  turboPaymentUrl: string | undefined;
};

const flag = (value: string | undefined) => value === "1" || value?.toLowerCase() === "true";

function positiveInteger(name: string, value: string | undefined, fallback: number, max: number) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw new McpError("invalid_config", `${name} must be an integer from 1 to ${max}.`);
  return parsed;
}

function ethLimit(name: string, value: string | undefined, fallback: string) {
  try { return parseAmount(value || fallback); }
  catch { throw new McpError("invalid_config", `${name} must be a positive ETH amount such as 0.1.`); }
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const key = env.FLOOR1_PRIVATE_KEY?.trim() || null;
  const privateKey = key ? (key.startsWith("0x") ? key : `0x${key}`) as Hex : null;
  if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new McpError("invalid_config", "FLOOR1_PRIVATE_KEY must be a 32-byte hex private key.");
  const maxSlippageBps = positiveInteger("FLOOR1_MAX_SLIPPAGE_BPS", env.FLOOR1_MAX_SLIPPAGE_BPS, 500, 5_000);
  if (maxSlippageBps < 10) throw new McpError("invalid_config", "FLOOR1_MAX_SLIPPAGE_BPS must be at least 10.");
  const list = env.FLOOR1_TOKEN_ALLOWLIST?.split(",").map(item => item.trim()).filter(Boolean) ?? [];
  if (list.some(item => !isAddress(item, { strict: false }))) throw new McpError("invalid_config", "FLOOR1_TOKEN_ALLOWLIST must be comma-separated token addresses.");
  const maxBuyWei = ethLimit("FLOOR1_MAX_BUY_ETH", env.FLOOR1_MAX_BUY_ETH, "0.1");
  const dailyMaxWei = ethLimit("FLOOR1_DAILY_MAX_ETH", env.FLOOR1_DAILY_MAX_ETH, "1");
  return {
    privateKey,
    rpcUrl: env.FLOOR1_RPC_URL?.trim() || null,
    apiUrl: env.FLOOR1_API_URL?.trim() || undefined,
    maxBuyWei,
    dailyMaxWei: dailyMaxWei < maxBuyWei ? maxBuyWei : dailyMaxWei,
    maxSlippageBps,
    defaultSlippageBps: Math.min(100, maxSlippageBps),
    allowlist: list.length ? list.map(item => item.toLowerCase() as Address) : null,
    allowPaidUploads: flag(env.FLOOR1_ARWEAVE_ALLOW_PAID),
    maxTxPerMinute: positiveInteger("FLOOR1_MAX_TX_PER_MINUTE", env.FLOOR1_MAX_TX_PER_MINUTE, 6, 60),
    turboUploadUrl: env.FLOOR1_TURBO_UPLOAD_URL?.trim() || undefined,
    turboPaymentUrl: env.FLOOR1_TURBO_PAYMENT_URL?.trim() || undefined,
  };
}
