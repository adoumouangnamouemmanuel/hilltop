import { describe, expect, it } from "vitest";
import { defaultConfig, type PlatformConfig } from "../src/config";
import { autoReleaseAt, paymentPlan, protectionSummary } from "../src/payments";

const withProtection = (p: Partial<PlatformConfig["protection"]>): PlatformConfig => ({
  ...defaultConfig,
  protection: { ...defaultConfig.protection, ...p },
});
const order = (total: number, extra: Partial<{ category: string; preorder: boolean; wantsProtection: boolean }> = {}) => ({
  total,
  category: "books",
  preorder: false,
  ...extra,
});

describe("payment plan", () => {
  it("protects orders at or above the threshold in hybrid mode", () => {
    expect(paymentPlan(defaultConfig, order(300))).toMatchObject({ kind: "protected", required: true, payNow: 312, atPickup: 0, fee: 12 });
    expect(paymentPlan(defaultConfig, order(299))).toMatchObject({
      kind: "pickup",
      required: false,
      optional: true,
      payNow: 0,
      atPickup: 299,
    });
  });

  it("lets buyers opt in below the threshold, unless optional protection is off", () => {
    expect(paymentPlan(defaultConfig, order(100, { wantsProtection: true }))).toMatchObject({ kind: "protected", payNow: 104 });
    expect(paymentPlan(withProtection({ optional: false }), order(100, { wantsProtection: true }))).toMatchObject({
      kind: "pickup",
      optional: false,
    });
  });

  it("always protects listed categories", () => {
    expect(paymentPlan(withProtection({ categories: ["books"] }), order(20)).kind).toBe("protected");
  });

  it("supports always and never modes", () => {
    expect(paymentPlan(withProtection({ mode: "always" }), order(5)).kind).toBe("protected");
    expect(paymentPlan(withProtection({ mode: "never", optional: false }), order(5000)).kind).toBe("pickup");
  });

  it("takes a deposit on pre-orders, or treats them normally when deposits are off", () => {
    expect(paymentPlan(defaultConfig, order(100, { preorder: true }))).toMatchObject({
      kind: "deposit",
      payNow: 31.2,
      atPickup: 70,
      fee: 1.2,
    });
    expect(paymentPlan(withProtection({ deposit: { enabled: false, rate: 0.3 } }), order(100, { preorder: true })).kind).toBe("pickup");
  });

  it("times auto-release from the handover", () => {
    expect(autoReleaseAt(1000, 24)).toBe(1000 + 24 * 3_600_000);
    expect(autoReleaseAt(1000, 0)).toBeNull();
    expect(autoReleaseAt(undefined, 24)).toBeNull();
  });

  it("describes the rules in a sentence", () => {
    expect(protectionSummary(defaultConfig)).toMatch(/from GH₵300/);
    expect(protectionSummary(withProtection({ mode: "always" }))).toBe("Payments are held until you collect your item.");
  });
});
