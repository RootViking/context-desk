import { describe, expect, it } from "vitest";
import { marketPhase, refreshIntervalMs } from "@/domain/session-clock";

describe("market phase", () => {
  it("classifies Eastern clock windows across standard and daylight time", () => {
    expect(marketPhase(new Date("2026-11-16T14:29:00Z"))).toBe("pre"); // 09:29 EST Monday
    expect(marketPhase(new Date("2026-11-16T14:30:00Z"))).toBe("regular");
    expect(marketPhase(new Date("2026-11-16T20:59:00Z"))).toBe("regular");
    expect(marketPhase(new Date("2026-11-16T21:00:00Z"))).toBe("after");
    expect(marketPhase(new Date("2026-11-17T02:00:00Z"))).toBe("closed"); // 21:00 EST Monday
    expect(marketPhase(new Date("2026-11-14T15:00:00Z"))).toBe("closed"); // Saturday
    expect(marketPhase(new Date("2026-07-06T13:30:00Z"))).toBe("regular"); // 09:30 EDT Monday
  });

  it("polls fastest during the regular session", () => {
    expect(refreshIntervalMs("regular")).toBe(30_000);
    expect(refreshIntervalMs("closed")).toBeGreaterThan(refreshIntervalMs("after"));
  });
});
