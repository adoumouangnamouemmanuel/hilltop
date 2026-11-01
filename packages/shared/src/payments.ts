import type { PlatformConfig } from "./config";
import { formatCedi, protectionFee } from "./format";

/*
 * How a buyer pays for an order, decided from the platform config:
 * protected  the full amount is paid in the app and held until collection
 * deposit    a share is paid in the app and held, the rest is paid at pickup (pre-orders)
 * pickup     nothing is paid in the app; the buyer pays the seller at the meet-up
 */

export type PaymentKind = "protected" | "deposit" | "pickup";

export type PaymentPlan = {
  kind: PaymentKind;
  /** Protection is required for this order (the buyer can't opt out). */
  required: boolean;
  /** The buyer may switch protection on or off. */
  optional: boolean;
  /** Charged in the app now, fee included. */
  payNow: number;
  /** Paid to the seller at pickup. */
  atPickup: number;
  /** Buyer protection fee on the part paid in the app. */
  fee: number;
};

const cents = (n: number) => Math.round(n * 100) / 100;

export function paymentPlan(
  config: Pick<PlatformConfig, "protection" | "fees" | "payments">,
  order: { total: number; category: string; preorder: boolean; wantsProtection?: boolean },
): PaymentPlan {
  const p = config.protection;
  const rate = config.fees.buyerProtectionRate;

  // Without in-app payments nothing can be held: everything is paid at pickup.
  if (!config.payments.inApp) return { kind: "pickup", required: false, optional: false, payNow: 0, atPickup: order.total, fee: 0 };

  if (order.preorder && p.deposit.enabled) {
    const deposit = cents(order.total * p.deposit.rate);
    const fee = protectionFee(deposit, rate);
    return { kind: "deposit", required: true, optional: false, payNow: cents(deposit + fee), atPickup: cents(order.total - deposit), fee };
  }

  const required = p.mode === "always" || (p.mode === "hybrid" && (order.total >= p.threshold || p.categories.includes(order.category)));
  const optional = !required && p.optional;
  if (required || (optional && order.wantsProtection)) {
    const fee = protectionFee(order.total, rate);
    return { kind: "protected", required, optional, payNow: cents(order.total + fee), atPickup: 0, fee };
  }
  return { kind: "pickup", required: false, optional, payNow: 0, atPickup: order.total, fee: 0 };
}

/** Whether money for this kind of order is held by the platform. */
export const holdsMoney = (kind: PaymentKind) => kind !== "pickup";

/** When held money is released automatically, or null if it isn't. */
export function autoReleaseAt(handedOverAt: number | undefined, hours: number) {
  return handedOverAt && hours > 0 ? handedOverAt + hours * 3_600_000 : null;
}

/** One sentence describing the current payment rules, for marketing copy and metadata. */
export function protectionSummary(config: Pick<PlatformConfig, "protection" | "payments">) {
  const p = config.protection;
  if (!config.payments.inApp) return "Reserve in the app and pay the seller when you meet.";
  if (p.mode === "always") return "Payments are held until you collect your item.";
  if (p.mode === "never")
    return p.optional ? "Pay the seller when you meet, or add buyer protection." : "Pay the seller directly when you meet.";
  return `Purchases from ${formatCedi(p.threshold)} are held until you collect; smaller ones you can pay at pickup.`;
}
