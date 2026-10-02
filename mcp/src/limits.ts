import { McpError } from "./errors.ts";

const refuse = (what: string, waitMs: number) => new McpError("local_rate_limited", `Too many ${what}. Wait ${Math.max(1, Math.ceil(waitMs / 1000))} s and try again.`, { retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) });

export function tokenBucket(what: string, perSecond: number, burst: number, now = () => Date.now()) {
  let tokens = burst;
  let updated = now();
  return () => {
    const time = now();
    tokens = Math.min(burst, tokens + (time - updated) / 1000 * perSecond);
    updated = time;
    if (tokens < 1) throw refuse(what, (1 - tokens) / perSecond * 1000);
    tokens -= 1;
  };
}

export function slidingWindow(what: string, limit: number, windowMs: number, now = () => Date.now()) {
  const stamps: number[] = [];
  const prune = (time: number) => { while (stamps.length && stamps[0] <= time - windowMs) stamps.shift(); };
  return {
    check() {
      const time = now();
      prune(time);
      if (stamps.length >= limit) throw refuse(what, stamps[0] + windowMs - time);
    },
    record() { stamps.push(now()); },
  };
}

export function spendLedger(limitWei: bigint, windowMs = 86_400_000, now = () => Date.now()) {
  const entries: { at: number; wei: bigint }[] = [];
  const spent = () => {
    const time = now();
    while (entries.length && entries[0].at <= time - windowMs) entries.shift();
    return entries.reduce((sum, entry) => sum + entry.wei, 0n);
  };
  return {
    spent,
    remaining: () => limitWei - spent(),
    record(wei: bigint) { entries.push({ at: now(), wei }); },
  };
}

export function singleFlight() {
  let busy = false;
  return async <T>(task: () => Promise<T>) => {
    if (busy) throw new McpError("busy", "Another Floor1 transaction from this wallet is still in flight. Wait for it to finish, then try again.");
    busy = true;
    try { return await task(); }
    finally { busy = false; }
  };
}

export function ttlCache<T>(ttlMs: number, maxEntries = 200, now = () => Date.now()) {
  const entries = new Map<string, { at: number; value: T }>();
  return {
    get(key: string) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.at + ttlMs <= now()) { entries.delete(key); return undefined; }
      return entry.value;
    },
    set(key: string, value: T) {
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value!);
      entries.set(key, { at: now(), value });
    },
  };
}
