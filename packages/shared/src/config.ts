import { z } from "zod";
import { baseCategories, type CategoryDef } from "./catalog";

/*
 * Platform configuration. Everything the marketplace used to hardcode lives here,
 * is edited in the admin portal, published as JSON, and read by the marketplace
 * at runtime. Unknown or missing fields fall back to the defaults below, so an
 * older published config never breaks a newer app.
 */

const attributeSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z][a-zA-Z0-9]*$/, "Use letters and numbers, starting with a lowercase letter"),
  label: z.string().min(1).max(40),
  type: z.enum(["select", "text", "number", "boolean"]),
  options: z.array(z.string().min(1).max(40)).optional(),
  unit: z.string().max(8).optional(),
  placeholder: z.string().max(60).optional(),
  filter: z.boolean().optional(),
});

export const categorySchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only"),
  label: z.string().min(1).max(40),
  icon: z.string().min(1),
  blurb: z.string().max(80),
  cover: z.string().optional(),
  attributes: z.array(attributeSchema),
  noCondition: z.boolean().optional(),
  custom: z.boolean().optional(),
  /** Hidden categories stay in the config but don't show in the marketplace. */
  enabled: z.boolean().optional(),
});

const money = z.number().min(0).max(1_000_000);

export const platformConfigSchema = z.object({
  version: z.number().int().min(1),
  publishedAt: z.string().nullable(),
  brand: z.object({
    name: z.string().min(1).max(40),
    tagline: z.string().max(120),
    supportEmail: z.string().email(),
  }),
  access: z.object({
    /** Email domains allowed to sign up, without the @. */
    allowedEmailDomains: z.array(z.string().min(3)).min(1),
    allowSingleSignOn: z.boolean(),
  }),
  fees: z.object({
    /** Fraction of the item price charged to the buyer for protection, e.g. 0.04. */
    buyerProtectionRate: z.number().min(0).max(0.3),
    /** Fraction kept from the seller's payout. */
    sellerFeeRate: z.number().min(0).max(0.3),
  }),
  payments: z.object({
    methods: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1).max(40),
        kind: z.enum(["momo", "card"]),
        enabled: z.boolean(),
      }),
    ),
  }),
  boostPlans: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1).max(30),
      price: money,
      reach: z.string().max(60),
      enabled: z.boolean(),
    }),
  ),
  pickupSpots: z.array(z.string().min(1).max(40)).min(1),
  conditions: z.array(z.object({ value: z.string().min(1).max(20), help: z.string().max(80) })).min(1),
  events: z.object({
    moveOut: z.object({
      enabled: z.boolean(),
      name: z.string().min(1).max(40),
      startsAt: z.string(),
      endsAt: z.string(),
      blurb: z.string().max(160),
    }),
  }),
  features: z.object({
    offers: z.boolean(),
    messaging: z.boolean(),
    reviews: z.boolean(),
    foodOrdering: z.boolean(),
    savedSearches: z.boolean(),
    sellerDashboard: z.boolean(),
    sellerCategories: z.boolean(),
    installPrompt: z.boolean(),
  }),
  offers: z.object({
    /** Offers below this share of the price are blocked. */
    minRatio: z.number().min(0).max(1),
    /** Demo only: sellers auto-accept offers at or above this share of the price. */
    autoAcceptRatio: z.number().min(0).max(1),
  }),
  listings: z.object({
    maxPhotos: z.number().int().min(1).max(20),
    titleMax: z.number().int().min(20).max(140),
    descriptionMax: z.number().int().min(100).max(5000),
    maxPrice: money,
    bannedWords: z.array(z.string().min(1)),
  }),
  disputes: z.object({
    reasons: z.array(z.object({ id: z.string().min(1), label: z.string().min(1).max(60) })).min(1),
    responseHours: z.number().int().min(1).max(168),
  }),
  search: z.object({
    popular: z.array(z.string().min(1).max(30)).max(12),
  }),
  announcement: z.object({
    enabled: z.boolean(),
    message: z.string().max(160),
    tone: z.enum(["info", "promo", "warning"]),
    href: z.string().optional(),
  }),
  categories: z.array(categorySchema),
});

export type PlatformConfig = z.infer<typeof platformConfigSchema>;
export type PaymentMethod = PlatformConfig["payments"]["methods"][number];
export type BoostPlan = PlatformConfig["boostPlans"][number];
export type FeatureFlag = keyof PlatformConfig["features"];

const ticketsCategory: CategoryDef = {
  id: "tickets",
  label: "Tickets & events",
  icon: "Ticket",
  blurb: "Concerts, sports, campus events",
  noCondition: true,
  attributes: [
    { key: "type", label: "Type", type: "select", options: ["Concert", "Sports", "Party", "Talk", "Trip"], filter: true },
    { key: "date", label: "Event date", type: "text", placeholder: "e.g. Sat 14 Nov" },
    { key: "venue", label: "Venue", type: "text" },
  ],
};

export const defaultConfig: PlatformConfig = {
  version: 1,
  publishedAt: null,
  brand: { name: "Hilltop", tagline: "The Ashesi student marketplace", supportEmail: "hello@hilltop.market" },
  access: { allowedEmailDomains: ["ashesi.edu.gh"], allowSingleSignOn: true },
  fees: { buyerProtectionRate: 0.04, sellerFeeRate: 0 },
  payments: {
    methods: [
      { id: "mtn", label: "MTN Mobile Money", kind: "momo", enabled: true },
      { id: "telecel", label: "Telecel Cash", kind: "momo", enabled: true },
      { id: "card", label: "Debit or credit card", kind: "card", enabled: true },
    ],
  },
  boostPlans: [
    { id: "day", label: "24 hours", price: 5, reach: "About 2x more views", enabled: true },
    { id: "week", label: "7 days", price: 15, reach: "About 5x more views", enabled: true },
  ],
  pickupSpots: ["Library", "Cafeteria", "Main gate", "Hostel A", "Hostel C", "Engineering block"],
  conditions: [
    { value: "New", help: "Unused, still in the packaging" },
    { value: "Like new", help: "Used once or twice, no marks" },
    { value: "Good", help: "Some signs of use, works perfectly" },
    { value: "Fair", help: "Visible wear, still fully usable" },
  ],
  events: {
    moveOut: {
      enabled: true,
      name: "Move-Out Sale",
      startsAt: "2026-12-04T09:00:00Z",
      endsAt: "2026-12-12T18:00:00Z",
      blurb: "Graduates are clearing out their rooms. Fridges, bedding and textbooks, priced to go.",
    },
  },
  features: {
    offers: true,
    messaging: true,
    reviews: true,
    foodOrdering: true,
    savedSearches: true,
    sellerDashboard: true,
    sellerCategories: true,
    installPrompt: true,
  },
  offers: { minRatio: 0.5, autoAcceptRatio: 0.85 },
  listings: { maxPhotos: 8, titleMax: 70, descriptionMax: 800, maxPrice: 100_000, bannedWords: [] },
  disputes: {
    reasons: [
      { id: "not-as-described", label: "Not as described" },
      { id: "damaged", label: "Damaged or not working" },
      { id: "wrong-item", label: "Wrong item" },
      { id: "no-show", label: "Seller didn't show up" },
      { id: "other", label: "Something else" },
    ],
    responseHours: 24,
  },
  search: { popular: ["iPhone", "Casio", "AirPods", "Bracelet", "Cookies", "Mini fridge", "Sunglasses"] },
  announcement: { enabled: false, message: "", tone: "info" },
  categories: [...baseCategories, ticketsCategory],
};

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);

/** Deep-merges `patch` over `base`. Arrays are replaced, not merged. */
export function mergeConfig<T>(base: T, patch: unknown): T {
  if (!isPlain(base) || !isPlain(patch)) return (patch === undefined ? base : patch) as T;
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = k in base ? mergeConfig((base as Plain)[k], v) : v;
  return out as T;
}

/**
 * Reads untrusted JSON into a valid config. Missing fields use defaults; if the
 * result still doesn't validate, the defaults are returned and the problems reported.
 */
export function parseConfig(input: unknown): { config: PlatformConfig; issues: string[] } {
  const merged = mergeConfig(defaultConfig, input);
  const result = platformConfigSchema.safeParse(merged);
  if (result.success) return { config: result.data, issues: [] };
  return { config: defaultConfig, issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}

/** Categories shoppers can see, in configured order. */
export const visibleCategories = (c: PlatformConfig) => c.categories.filter((cat) => cat.enabled !== false);

export const enabledPaymentMethods = (c: PlatformConfig) => c.payments.methods.filter((m) => m.enabled);
export const enabledBoostPlans = (c: PlatformConfig) => c.boostPlans.filter((p) => p.enabled);

/** Builds the sign-in email check from the allowed domains. */
export function emailAllowed(email: string, c: Pick<PlatformConfig, "access">) {
  const match = /^[a-z0-9._%+-]+@([a-z0-9.-]+)$/i.exec(email.trim());
  return !!match && c.access.allowedEmailDomains.some((d) => match[1].toLowerCase() === d.toLowerCase());
}

/** Whether a piece of text contains a banned word (whole words, case-insensitive). */
export function findBannedWord(text: string, banned: string[]) {
  const lower = text.toLowerCase();
  return banned.find((w) => new RegExp(`\\b${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) ?? null;
}

/** Lists the paths that differ between two configs, for the admin publish diff. */
export function diffConfig(a: unknown, b: unknown, path: string[] = []): string[] {
  if (isPlain(a) && isPlain(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) => (k === "version" || k === "publishedAt" ? [] : diffConfig(a[k], b[k], [...path, k])));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [path.join(".")];
}

/** "4%" or "3.5%" from a rate like 0.04. */
export const percent = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });
const year = new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "UTC" });

/** "4 to 12 December", "28 November to 3 December", optionally with the year. */
export function dateRange(startsAt: string, endsAt: string, withYear = false) {
  const a = new Date(startsAt);
  const b = new Date(endsAt);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  const range = sameMonth ? `${day.format(a)} to ${dayMonth.format(b)}` : `${dayMonth.format(a)} to ${dayMonth.format(b)}`;
  return withYear ? `${range} ${year.format(b)}` : range;
}

/** Whether an event is switched on and hasn't finished yet. */
export const eventLive = (e: { enabled: boolean; endsAt: string }, now: number) => e.enabled && new Date(e.endsAt).getTime() > now;
