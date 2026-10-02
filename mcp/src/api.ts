import { createFloor1Client, Floor1Error, type Quote, type QuoteParams } from "@floor1/sdk";
import { isAddress, type Address } from "viem";
import { McpError } from "./errors.ts";
import { tokenBucket, ttlCache } from "./limits.ts";

export const MAX_RETRY_AFTER_SECONDS = 10;
const DEFAULT_API = "https://www.floor1.fun";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function onceAfterRetry<T>(request: () => Promise<T>): Promise<T> {
  try { return await request(); }
  catch (error) {
    const wait = error instanceof Floor1Error && error.status === 429 ? error.retryAfterSeconds ?? 1 : null;
    if (wait === null || wait > MAX_RETRY_AFTER_SECONDS) throw error;
    await sleep(wait * 1000);
    return request();
  }
}

export type TokenSummary = { id: Address; name: string; symbol: string; priceQuote: number; marketCapQuote: number; priceUsd: number | null; marketCapUsd: number | null; change24h: number; holders: number; graduated: boolean; createdAt: number; image: string };

export function createApi(apiUrl: string | undefined, fetcher: typeof fetch = globalThis.fetch) {
  const client = createFloor1Client({ baseUrl: apiUrl, fetch: fetcher });
  const base = new URL(apiUrl ?? DEFAULT_API);
  const quoteBucket = tokenBucket("quote requests", 2, 5);
  const readBucket = tokenBucket("market reads", 2, 2);
  const cache = ttlCache<unknown>(5_000);

  async function get(path: string, params: Record<string, string> = {}) {
    const url = new URL(path, base);
    for (const key of Object.keys(params).sort()) url.searchParams.set(key, params[key]);
    const cached = cache.get(url.href);
    if (cached !== undefined) return cached;
    readBucket();
    const body = await onceAfterRetry(async () => {
      let response: Response;
      try { response = await fetcher(url, { headers: { Accept: "application/json" }, credentials: "omit", cache: "no-store" }); }
      catch { throw new Floor1Error("network", "The market request could not reach Floor1."); }
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = data as { error?: { code?: unknown; message?: unknown } } | null;
        const retry = Number(response.headers.get("Retry-After") ?? NaN);
        throw new Floor1Error(typeof failure?.error?.code === "string" ? failure.error.code : "unavailable", typeof failure?.error?.message === "string" ? failure.error.message : "The market request failed.", response.status, Number.isFinite(retry) && retry > 0 ? retry : undefined);
      }
      return data;
    });
    cache.set(url.href, body);
    return body;
  }

  return {
    async quote(params: QuoteParams): Promise<Quote> {
      quoteBucket();
      return onceAfterRetry(() => client.quote(params));
    },
    async search(query: string, limit: number) {
      const q = query.trim();
      if (!q || q.length > 64) throw new McpError("invalid_query", "Search text must be 1 to 64 characters.");
      const data = await get("/api/v1/tokens/search", { q, limit: String(limit) }) as { items?: TokenSummary[] };
      return Array.isArray(data?.items) ? data.items : [];
    },
    async token(id: string) {
      if (!isAddress(id, { strict: false })) throw new McpError("invalid_token", "Use a token contract address.");
      return get(`/api/v1/tokens/${encodeURIComponent(id.toLowerCase())}`);
    },
  };
}

export type Api = ReturnType<typeof createApi>;
