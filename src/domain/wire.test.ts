import { describe, expect, it } from "vitest";
import { classifyWireTitle, eventRisk, filterWire, sortWire, toneRead, WIRE_FEEDS } from "@/domain/wire";

const feed = WIRE_FEEDS[0];
const mk = (title: string, publishedAt: string | null = "2026-11-16T14:00:00.000Z") => classifyWireTitle(feed, { title, url: `https://example.com/${encodeURIComponent(title)}`, publishedAt, linkHost: "example.com" });

describe("wire", () => {
  it("reads keyword tone and keeps the words", () => {
    expect(toneRead("Nvidia surges to a record high")).toEqual({ tone: "up", words: ["surges", "record high"] });
    expect(toneRead("Tesla recall probe widens").tone).toBe("down");
    expect(toneRead("Fed holds rates").tone).toBe("flat");
  });

  it("tags watchlist symbols and macro cues", () => {
    const item = mk("Tesla jumps as tariffs ease");
    expect(item.symbols).toEqual(["TSLA"]);
    expect(item.macroCue).toBe("tariff");
    expect(item.tone).toBe("up");
  });

  it("filters by symbol, watchlist, and macro", () => {
    const items = [mk("Meta beats"), mk("Inflation cools"), mk("Weather report")];
    expect(filterWire(items, "symbol", "META").length).toBe(1);
    expect(filterWire(items, "watchlist", "META").length).toBe(1);
    expect(filterWire(items, "macro", "META").length).toBe(1);
    expect(filterWire(items, "all", "META").length).toBe(3);
  });

  it("sorts newest first with unknown times last", () => {
    const sorted = sortWire([mk("old", "2026-11-16T10:00:00.000Z"), mk("none", null), mk("new", "2026-11-16T15:00:00.000Z")]);
    expect(sorted.map((i) => i.title)).toEqual(["new", "old", "none"]);
  });

  it("puts the news first on FOMC day and keeps unknown FOMC unknown", () => {
    expect(eventRisk({ sessionDate: "2026-12-09", fomcDate: "2026-12-09", fomcKnown: true, earningsDate: null, namedFreshCount: 0, macroFreshCount: 0 }).level).toBe("news_first");
    expect(eventRisk({ sessionDate: "2026-11-16", fomcDate: null, fomcKnown: false, earningsDate: null, namedFreshCount: 0, macroFreshCount: 0 }).level).toBe("unknown");
    expect(eventRisk({ sessionDate: "2026-11-16", fomcDate: "2026-12-09", fomcKnown: true, earningsDate: null, namedFreshCount: 2, macroFreshCount: 0 }).level).toBe("watch");
  });
});
