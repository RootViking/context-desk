import { macroCue, watchlistMentions } from "@/domain/ticker-feed";
import { WATCHLIST } from "@/domain/watchlist";

/**
 * Public RSS feeds read for titles, links, and publication times only. Bodies are never retrieved.
 * Each is a syndication feed the publisher offers for readers. The desk is not the publisher and
 * a headline is never a quote. These are context, and "noticia mata estrategia" means they come first.
 */
export type WireFeed = { id: string; label: string; publisher: string; url: string; host: string; scope: "markets" | "macro" };

export const WIRE_FEEDS: readonly WireFeed[] = [
  { id: "cnbc_top", label: "CNBC · US top news", publisher: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", host: "www.cnbc.com", scope: "markets" },
  { id: "cnbc_finance", label: "CNBC · Finance", publisher: "CNBC", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", host: "www.cnbc.com", scope: "markets" },
  { id: "mw_top", label: "MarketWatch · top stories", publisher: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", host: "feeds.content.dowjones.io", scope: "markets" },
  { id: "nasdaq_markets", label: "Nasdaq · markets", publisher: "Nasdaq", url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets", host: "www.nasdaq.com", scope: "markets" },
  { id: "fed_all", label: "Federal Reserve · all press", publisher: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml", host: "www.federalreserve.gov", scope: "macro" },
  { id: "sec_press", label: "SEC · press releases", publisher: "SEC", url: "https://www.sec.gov/news/pressreleases.rss", host: "www.sec.gov", scope: "macro" },
];

export type Tone = "up" | "down" | "flat";

export type WireItem = {
  id: string;
  feedId: string;
  publisher: string;
  title: string;
  url: string;
  publishedAt: string | null;
  linkHost: string;
  /** Watchlist symbols the title names, by alias. Not a relevance judgment. */
  symbols: string[];
  macroCue: string | null;
  /** Keyword tone of the title. An interpretation of words, not a reading of the story. */
  tone: Tone;
  toneWords: string[];
};

const SYMBOLS = WATCHLIST.map((instrument) => instrument.symbol);

const UP_WORDS = ["surge", "surges", "rally", "rallies", "rallied", "soar", "soars", "soared", "jump", "jumps", "jumped", "beat", "beats", "record high", "upgrade", "upgrades", "upgraded", "gain", "gains", "gained", "climb", "climbs", "climbed", "boost", "boosts", "boosted", "bullish", "outperform", "raises guidance", "raised guidance", "rebound", "rebounds", "rebounded"];
const DOWN_WORDS = ["plunge", "plunges", "plunged", "slump", "slumps", "slumped", "tumble", "tumbles", "tumbled", "drop", "drops", "dropped", "fall", "falls", "fell", "miss", "misses", "missed", "downgrade", "downgrades", "downgraded", "cut", "cuts", "lawsuit", "probe", "investigation", "recall", "recalls", "bearish", "selloff", "sell-off", "sinks", "sink", "sank", "warns", "warning", "layoffs", "lowers guidance", "lowered guidance", "crash", "crashes"];

function hits(text: string, words: readonly string[]): string[] {
  const lower = text.toLowerCase();
  return words.filter((word) => new RegExp(`(?:^|[^a-z])${word.replace(/[-]/g, "\\-")}(?:[^a-z]|$)`).test(lower));
}

/** Keyword tone. "Fed cuts rates" and "cuts jobs" both count as down words; that is why it is labeled a keyword read. */
export function toneRead(title: string): { tone: Tone; words: string[] } {
  const up = hits(title, UP_WORDS);
  const down = hits(title, DOWN_WORDS);
  if (up.length === down.length) return { tone: "flat", words: [...up, ...down] };
  return up.length > down.length ? { tone: "up", words: up } : { tone: "down", words: down };
}

export function classifyWireTitle(feed: WireFeed, raw: { title: string; url: string; publishedAt: string | null; linkHost: string }): WireItem {
  const tone = toneRead(raw.title);
  return {
    id: `${feed.id}:${raw.url}`,
    feedId: feed.id,
    publisher: feed.publisher,
    title: raw.title,
    url: raw.url,
    publishedAt: raw.publishedAt,
    linkHost: raw.linkHost,
    symbols: watchlistMentions(raw.title, SYMBOLS),
    macroCue: macroCue(raw.title),
    tone: tone.tone,
    toneWords: tone.words,
  };
}

export type WireFilter = "symbol" | "watchlist" | "macro" | "all";

export function filterWire(items: WireItem[], filter: WireFilter, symbol: string): WireItem[] {
  if (filter === "symbol") return items.filter((item) => item.symbols.includes(symbol));
  if (filter === "watchlist") return items.filter((item) => item.symbols.length > 0);
  if (filter === "macro") return items.filter((item) => item.macroCue !== null || WIRE_FEEDS.find((feed) => feed.id === item.feedId)?.scope === "macro");
  return items;
}

/** Newest first. Items without a time sort last, so an unknown time never reads as fresh. */
export function sortWire(items: WireItem[]): WireItem[] {
  return [...items].sort((a, b) => {
    const at = a.publishedAt ? Date.parse(a.publishedAt) : Number.NEGATIVE_INFINITY;
    const bt = b.publishedAt ? Date.parse(b.publishedAt) : Number.NEGATIVE_INFINITY;
    return bt - at;
  });
}

export type EventRisk = {
  level: "news_first" | "watch" | "quiet" | "unknown";
  lines: string[];
};

/**
 * "Noticia mata estrategia": the things that outrank a setup. FOMC on the session date, earnings within
 * a day, or a fresh headline that names the symbol put the news first. Unknown inputs stay Unknown.
 */
export function eventRisk(input: {
  sessionDate: string;
  fomcDate: string | null;
  fomcKnown: boolean;
  earningsDate: string | null;
  namedFreshCount: number;
  macroFreshCount: number;
}): EventRisk {
  const lines: string[] = [];
  const levels: EventRisk["level"][] = [];
  const daysTo = (date: string) => Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${input.sessionDate}T12:00:00Z`)) / 86_400_000);
  if (!input.fomcKnown) {
    lines.push("FOMC schedule Unknown. The calendar did not load.");
    levels.push("unknown");
  } else if (input.fomcDate) {
    const d = daysTo(input.fomcDate);
    if (d === 0) {
      lines.push("FOMC decision day. The statement outranks any setup.");
      levels.push("news_first");
    } else if (d === 1) {
      lines.push("FOMC is tomorrow. Positioning into it is a news bet, not a band trade.");
      levels.push("watch");
    } else lines.push(`Next FOMC in ${d} days.`);
  }
  if (input.earningsDate) {
    const d = daysTo(input.earningsDate);
    if (d <= 1) {
      lines.push(d === 0 ? "Earnings on this session date. The report outranks the bands." : "Earnings tomorrow. The report outranks the bands.");
      levels.push("news_first");
    } else lines.push(`Recorded earnings in ${d} days.`);
  } else lines.push("No earnings date recorded for this symbol. Unknown is not “none.”");
  if (input.namedFreshCount > 0) {
    lines.push(`${input.namedFreshCount} fresh headline${input.namedFreshCount === 1 ? "" : "s"} name the symbol in the last 6 hours. Read them before the chart.`);
    levels.push("watch");
  }
  if (input.macroFreshCount > 0) lines.push(`${input.macroFreshCount} fresh macro title${input.macroFreshCount === 1 ? "" : "s"} in the last 6 hours.`);
  const level: EventRisk["level"] = levels.includes("news_first") ? "news_first" : levels.includes("unknown") ? "unknown" : levels.includes("watch") ? "watch" : "quiet";
  return { level, lines };
}
