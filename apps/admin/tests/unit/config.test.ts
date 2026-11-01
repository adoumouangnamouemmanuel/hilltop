import { describe, expect, it } from "vitest";
import { deepEqual, defaultConfig, diffConfig, emailAllowed, findBannedWord, parseConfig, percent } from "@hilltop/shared/config";
import { allPermissions, can, defaultRoles, togglePermission } from "@hilltop/shared/permissions";

describe("platform config", () => {
  it("fills missing fields from defaults", () => {
    const { config, issues } = parseConfig({ fees: { buyerProtectionRate: 0.05 } });
    expect(issues).toEqual([]);
    expect(config.fees).toEqual({ buyerProtectionRate: 0.05, sellerFeeRate: 0 });
    expect(config.brand.name).toBe("Hilltop");
  });

  it("falls back to defaults on invalid input", () => {
    const { config, issues } = parseConfig({ fees: { buyerProtectionRate: 5 } });
    expect(issues.length).toBeGreaterThan(0);
    expect(config).toBe(defaultConfig);
  });

  it("diffs by path, ignoring version and key order", () => {
    const reordered = {
      ...defaultConfig,
      categories: defaultConfig.categories.map((c) => Object.fromEntries(Object.entries(c).reverse())),
    };
    expect(diffConfig(defaultConfig, { ...reordered, version: 9 })).toEqual([]);
    expect(diffConfig(defaultConfig, { ...defaultConfig, fees: { ...defaultConfig.fees, sellerFeeRate: 0.02 } })).toEqual([
      "fees.sellerFeeRate",
    ]);
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it("checks email domains and banned words", () => {
    expect(emailAllowed("kofi@ASHESI.edu.gh", defaultConfig)).toBe(true);
    expect(emailAllowed("kofi@gmail.com", defaultConfig)).toBe(false);
    expect(findBannedWord("Selling a replica watch", ["replica"])).toBe("replica");
    expect(findBannedWord("Replicate this", ["replica"])).toBeNull();
    expect(percent(0.035)).toBe("3.5%");
  });
});

describe("roles", () => {
  it("gives the owner every permission and lets toggles add and remove", () => {
    const [owner, , moderator] = defaultRoles;
    expect(allPermissions.every((p) => can(owner, p))).toBe(true);
    expect(can(togglePermission(moderator, "orders.refund"), "orders.refund")).toBe(true);
    expect(can(togglePermission(moderator, "listings.moderate"), "listings.moderate")).toBe(false);
    expect(togglePermission(owner, "team.manage")).toBe(owner);
  });
});
