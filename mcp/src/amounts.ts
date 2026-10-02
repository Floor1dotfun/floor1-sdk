import { formatUnits } from "viem";
import { McpError } from "./errors.ts";

export const DECIMALS = 18;
const MAX_UINT256 = 2n ** 256n - 1n;
const DECIMAL = /^(0|[1-9][0-9]{0,59})(\.[0-9]{1,18})?$/;

export function parseAmount(value: unknown, field = "amount") {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new McpError("invalid_amount", `${field} must be a positive decimal string with at most ${DECIMALS} decimal places, such as "0.01".`);
  const [whole, fraction = ""] = value.split(".");
  const atomic = BigInt(whole) * 10n ** BigInt(DECIMALS) + BigInt(fraction.padEnd(DECIMALS, "0"));
  if (atomic === 0n) throw new McpError("invalid_amount", `${field} must be greater than zero.`);
  if (atomic > MAX_UINT256) throw new McpError("invalid_amount", `${field} is too large.`);
  return atomic;
}

export const display = (atomic: bigint | string) => formatUnits(BigInt(atomic), DECIMALS);
