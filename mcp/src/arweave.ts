import { TurboFactory } from "@ardrive/turbo-sdk";
import type { Hex } from "viem";
import { McpError } from "./errors.ts";

export const IMAGE_MAX_BYTES = 96 * 1024;
export const FREE_ITEM_MAX_BYTES = 107_520;
export const FREE_WALLET_LIFETIME_BYTES = 10 * 1024 * 1024;
export const DATA_ITEM_OVERHEAD_BYTES = 1_024;
const DEFAULT_PAYMENT_URL = "https://payment.ardrive.io";
const ARWEAVE_ID = /^[A-Za-z0-9_-]{43}$/;

export type LaunchDraft = { name: string; symbol: string; description?: string; website?: string; x?: string; telegram?: string };
export type TokenMetadata = { name: string; symbol: string; description: string; image: `ar://${string}`; links: { website?: string; x?: string; telegram?: string } };

export function sniffImageType(bytes: Uint8Array) {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  return null;
}

function httpsUrl(value: string, hosts?: readonly string[]) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (!hosts || hosts.some(host => url.hostname === host || url.hostname === `www.${host}`));
  } catch {
    return false;
  }
}

export function validateDraft(draft: LaunchDraft) {
  const issues: string[] = [];
  const name = draft.name.trim();
  if (!name || name.length > 32) issues.push("name must be 1 to 32 characters");
  if (!/^[A-Z0-9]{1,10}$/.test(draft.symbol)) issues.push("symbol must be 1 to 10 uppercase letters or numbers");
  if ((draft.description ?? "").trim().length > 500) issues.push("description must be 500 characters or fewer");
  if (draft.website && !httpsUrl(draft.website)) issues.push("website must be a full https:// link");
  if (draft.x && !httpsUrl(draft.x, ["x.com", "twitter.com"])) issues.push("x must be an https://x.com link");
  if (draft.telegram && !httpsUrl(draft.telegram, ["t.me"])) issues.push("telegram must be an https://t.me link");
  if (issues.length) throw new McpError("invalid_metadata", `Fix the launch details: ${issues.join("; ")}.`);
}

export function buildMetadata(draft: LaunchDraft, image: `ar://${string}`): TokenMetadata {
  const links = Object.fromEntries((["website", "x", "telegram"] as const).filter(key => draft[key]).map(key => [key, draft[key]]));
  return { name: draft.name.trim(), symbol: draft.symbol, description: (draft.description ?? "").trim(), image, links };
}

export function checkImage(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > IMAGE_MAX_BYTES) throw new McpError("invalid_image", `The image must be between 1 byte and ${IMAGE_MAX_BYTES} bytes (96 KB). Compress it first.`);
  const contentType = sniffImageType(bytes);
  if (!contentType) throw new McpError("invalid_image", "The image must be a PNG, JPEG or WebP file.");
  return contentType;
}

export const freeTierCaps = `Arweave uploads through Turbo are free only up to ${FREE_ITEM_MAX_BYTES} bytes per item, ${FREE_WALLET_LIFETIME_BYTES / 1024 / 1024} MiB per wallet and 10 MiB per network address over their lifetime`;

export function createUploader(privateKey: Hex | null, address: string | null, options: { allowPaid: boolean; uploadUrl?: string; paymentUrl?: string; fetch?: typeof fetch }) {
  const fetcher = options.fetch ?? globalThis.fetch;

  async function freeBytesRemaining(): Promise<number | null> {
    if (!address) throw new McpError("signer_required", "Set FLOOR1_PRIVATE_KEY to upload launch metadata, or pass metadata_uri for metadata you already uploaded.");
    const url = new URL(`/v1/account/free?address=${encodeURIComponent(address)}`, options.paymentUrl ?? DEFAULT_PAYMENT_URL);
    let response: Response;
    try { response = await fetcher(url, { headers: { Accept: "application/json" } }); }
    catch { throw new McpError("upload_unavailable", "The Arweave uploader's allowance check did not answer. Try again later."); }
    if (response.status === 404) return null;
    const body = await response.json().catch(() => null) as { bytesRemaining?: unknown } | null;
    if (!response.ok || !body) throw new McpError("upload_unavailable", "The Arweave uploader's allowance check failed. Try again later.");
    return typeof body.bytesRemaining === "number" && Number.isFinite(body.bytesRemaining) ? body.bytesRemaining : null;
  }

  async function plan(sizes: number[]) {
    const needed = sizes.reduce((sum, size) => sum + size + DATA_ITEM_OVERHEAD_BYTES, 0);
    const remaining = await freeBytesRemaining();
    const free = remaining === null || remaining >= needed;
    if (!free && !options.allowPaid) throw new McpError("free_tier_exhausted", `${freeTierCaps}. This launch needs about ${needed} bytes and this wallet has ${remaining} free bytes left. Add Turbo credits to the wallet and set FLOOR1_ARWEAVE_ALLOW_PAID=1 to pay for uploads.`, { neededBytes: needed, freeBytesRemaining: remaining });
    return { neededBytes: needed, freeBytesRemaining: remaining, paid: !free };
  }

  async function upload(data: Uint8Array, contentType: string, kind: "token-image" | "token-metadata") {
    if (!privateKey) throw new McpError("signer_required", "Set FLOOR1_PRIVATE_KEY to upload launch metadata.");
    const turbo = TurboFactory.authenticated({
      privateKey,
      token: "ethereum",
      uploadServiceConfig: { ...(options.uploadUrl ? { url: options.uploadUrl } : {}), retryConfig: { retries: 2, retryDelay: () => 1_000, onRetry: () => {} } },
      ...(options.paymentUrl ? { paymentServiceConfig: { url: options.paymentUrl } } : {}),
    });
    let id: string;
    try {
      ({ id } = await turbo.upload({ data, dataItemOpts: { tags: [{ name: "Content-Type", value: contentType }, { name: "App-Name", value: "Floor1" }, { name: "Floor1-Type", value: kind }] }, signal: AbortSignal.timeout(30_000) }));
    } catch (error) {
      const status = (error as { status?: unknown }).status;
      if (status === 402 || /\b402\b|insufficient/i.test(String((error as Error)?.message))) throw new McpError("upload_payment_required", `The uploader refused the ${kind} as unpaid. ${freeTierCaps}, so the wallet or network address may have used its free allowance. Add Turbo credits and set FLOOR1_ARWEAVE_ALLOW_PAID=1.`);
      throw new McpError("upload_failed", `The ${kind} upload failed. Nothing was minted. Try again later.`);
    }
    if (!ARWEAVE_ID.test(id)) throw new McpError("upload_failed", "The uploader returned an invalid Arweave id.");
    return `ar://${id}` as const;
  }

  return { plan, upload };
}
