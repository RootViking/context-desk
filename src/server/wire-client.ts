import { parseRssItems } from "@/domain/rss-parse";
import { classifyWireTitle, sortWire, WIRE_FEEDS, type WireItem } from "@/domain/wire";
import { publicGet } from "@/server/public-get";

export type WireFeedStatus = { id: string; label: string; url: string; state: "ok" | "error"; error: string | null; count: number };
export type WireLoad = { retrievedAt: string; feeds: WireFeedStatus[]; items: WireItem[] };

const MAX_BYTES = 2_000_000;
const USER_AGENT = "ContextDesk/0.2 (personal read-only; unpublished workstation)";
const TTL_MS = 60_000;
let cached: { at: number; value: WireLoad } | null = null;

export function clearWireCache(): void {
  cached = null;
}

/** All public wire feeds in parallel. A feed that fails stays listed as Unknown; its gap is not filled. */
export async function loadWire(fetchImpl: typeof fetch, options?: { now?: Date; timeoutMs?: number; bypassCache?: boolean }): Promise<WireLoad> {
  const now = options?.now ?? new Date();
  if (!options?.bypassCache && cached && now.getTime() - cached.at < TTL_MS) return cached.value;
  const timeoutMs = options?.timeoutMs ?? 8_000;
  const results = await Promise.all(
    WIRE_FEEDS.map(async (feed) => {
      const result = await publicGet(fetchImpl, feed.url, { host: feed.host, timeoutMs, maxBytes: MAX_BYTES, accept: "application/rss+xml, application/xml, text/xml;q=0.9", userAgent: USER_AGENT, label: feed.label });
      if (!result.ok) return { status: { id: feed.id, label: feed.label, url: feed.url, state: "error" as const, error: result.error, count: 0 }, items: [] as WireItem[] };
      const raws = parseRssItems(result.text);
      const items = raws.map((raw) => classifyWireTitle(feed, raw));
      return { status: { id: feed.id, label: feed.label, url: feed.url, state: "ok" as const, error: items.length ? null : "Feed returned no usable items.", count: items.length }, items };
    }),
  );
  const value: WireLoad = { retrievedAt: now.toISOString(), feeds: results.map((r) => r.status), items: sortWire(results.flatMap((r) => r.items)) };
  cached = { at: now.getTime(), value };
  return value;
}
