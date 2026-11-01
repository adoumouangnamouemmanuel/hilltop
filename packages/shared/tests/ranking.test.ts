import { describe, expect, it } from "vitest";
import { defaultConfig, type PlatformConfig } from "../src/config";
import { expiresIn, rankScore, rankSignals, withExpiry } from "../src/ranking";
import { getListing, type Listing } from "../src/seed";

const base = getListing("bucket")!;
const at = (days: number, extra: Partial<Listing> = {}): Listing => ({ ...base, postedDaysAgo: days, ...extra });

describe("expiry", () => {
  it("expires active listings past the window, and only those", () => {
    const [fresh, old, sold] = withExpiry([at(29), at(30), at(40, { status: "sold" })], 30);
    expect(fresh.status).toBeUndefined();
    expect(old.status).toBe("expired");
    expect(sold.status).toBe("sold");
  });

  it("never expires when the window is 0", () => {
    const list = [at(400)];
    expect(withExpiry(list, 0)).toBe(list);
    expect(expiresIn(at(400), 0)).toBeNull();
    expect(expiresIn(at(25), 30)).toBe(5);
  });
});

describe("ranking", () => {
  const weights = (w: Partial<PlatformConfig["ranking"]>): PlatformConfig => ({
    ...defaultConfig,
    ranking: { freshness: 0, photos: 0, popularity: 0, sellerRating: 0, promoted: 0, featured: 0, ...w },
  });

  it("scores each signal between 0 and 1", () => {
    for (const v of Object.values(rankSignals(at(3), defaultConfig))) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("favours newer listings when freshness counts", () => {
    const c = weights({ freshness: 5 });
    expect(rankScore(at(1), c)).toBeGreaterThan(rankScore(at(20), c));
  });

  it("puts featured listings first when featuring counts", () => {
    const c = { ...weights({ featured: 10, freshness: 1 }), featured: { title: "Picks", listingIds: ["bucket"] } };
    expect(rankScore(at(25), c)).toBeGreaterThan(rankScore(at(0, { id: "other" }), c));
  });

  it("ignores signals with zero weight", () => {
    expect(rankScore(at(1, { promoted: true }), weights({}))).toBe(0);
  });
});
