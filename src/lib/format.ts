import { PROTECTION_FEE_RATE } from "./data";

const currency = { style: "currency", currency: "GHS", currencyDisplay: "narrowSymbol" } as const;
const wholeCedi = new Intl.NumberFormat("en-GH", { ...currency, maximumFractionDigits: 0 });
const cedi = new Intl.NumberFormat("en-GH", { ...currency, minimumFractionDigits: 2 });

/** GH₵950 for whole amounts, GH₵1,175.20 otherwise. */
export function formatCedi(amount: number) {
  return Number.isInteger(amount) ? wholeCedi.format(amount) : cedi.format(amount);
}

export function protectionFee(price: number) {
  return Math.round(price * PROTECTION_FEE_RATE * 100) / 100;
}

export function postedLabel(daysAgo: number) {
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return `${daysAgo} days ago`;
}

export function discountPercent(price: number, original?: number) {
  return original && original > price ? Math.round((1 - price / original) * 100) : 0;
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
}

export function firstName(name: string) {
  return name.split(" ")[0];
}

export const ASHESI_EMAIL = /^[a-z0-9._%+-]+@ashesi\.edu\.gh$/i;
