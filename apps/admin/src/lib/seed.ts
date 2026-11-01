import { defaultConfig } from "@hilltop/shared/config";
import { paymentPlan } from "@hilltop/shared/payments";
import { defaultRoles, OWNER_ROLE } from "@hilltop/shared/permissions";
import { listings as seedListings, sellers } from "@hilltop/shared/seed";
import type { AdminDispute, AdminOrder, AdminState, AdminUser, AuditEntry, Member, ModListing, OrderStatus } from "./types";

/*
 * Mock operational data, generated deterministically from the marketplace seed so
 * the numbers stay stable between reloads and line up with what shoppers see.
 */

export const DAY = 86_400_000;
export const HOUR = 3_600_000;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const buyers = [
  ["Kofi Darko", "Business Administration", 2027],
  ["Esi Quaye", "Computer Science", 2028],
  ["Kojo Antwi", "Mechanical Engineering", 2026],
  ["Maame Serwaa", "Economics", 2027],
  ["Edem Kpodo", "Management Information Systems", 2029],
  ["Akua Darkwa", "Computer Engineering", 2028],
  ["Fiifi Sackey", "Business Administration", 2026],
  ["Adwoa Boakye", "Law with Public Policy", 2029],
  ["Yaa Asantewaa", "Electrical Engineering", 2027],
  ["Kwesi Arthur", "Computer Science", 2028],
  ["Dzifa Amegah", "Economics", 2026],
  ["Elikem Nyarko", "Mechatronics", 2029],
] as const;

const email = (name: string) => `${name.toLowerCase().replace(/\s+/g, ".")}@ashesi.edu.gh`;

export const reportReasons = ["Prohibited item", "Misleading photos", "Suspected scam", "Wrong category", "Offensive content"];

export function seedState(now: number): AdminState {
  const rand = mulberry32(20261031);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

  const users: AdminUser[] = [
    ...sellers.map((s, i) => ({
      id: s.id,
      name: s.name,
      email: email(s.name),
      classOf: s.classOf,
      major: s.major,
      status: "active" as const,
      verified: true,
      joinedAt: now - (400 - i * 37) * DAY,
      listings: seedListings.filter((l) => l.sellerId === s.id).length,
      sales: s.sales,
      purchases: Math.floor(rand() * 14),
      rating: s.rating,
      reports: 0,
    })),
    ...buyers.map(([name, major, classOf], i) => ({
      id: `u-${i + 1}`,
      name,
      email: email(name),
      classOf,
      major,
      status: (i === 6 ? "suspended" : "active") as AdminUser["status"],
      verified: i % 5 !== 3,
      joinedAt: now - Math.floor(rand() * 300 + 2) * DAY,
      listings: 0,
      sales: 0,
      purchases: Math.floor(rand() * 20),
      rating: null,
      reports: 0,
    })),
  ];

  const listings: ModListing[] = seedListings.map((l, i) => ({
    id: l.id,
    title: l.title,
    price: l.price,
    category: l.category,
    image: l.images[0],
    sellerId: l.sellerId,
    sellerName: sellers.find((s) => s.id === l.sellerId)?.name ?? "Unknown",
    state: l.status === "sold" ? "sold" : l.status === "draft" ? "hidden" : "live",
    featured: !!l.promoted,
    views: l.views,
    saves: l.saves,
    postedAt: now - l.postedDaysAgo * DAY - i * HOUR,
    reports: [],
  }));

  // A handful of reported listings for the moderation queue.
  for (const [n, index] of [3, 8, 13, 21].entries()) {
    const l = listings[index % listings.length];
    l.reports = Array.from({ length: n + 1 }, (_, k) => ({
      id: `r-${l.id}-${k}`,
      reason: reportReasons[(n + k) % reportReasons.length],
      by: buyers[(n * 3 + k) % buyers.length][0],
      at: now - (k * 5 + n * 3 + 1) * HOUR,
    }));
    const owner = users.find((u) => u.id === l.sellerId);
    if (owner) owner.reports += l.reports.length;
  }

  const live = listings.filter((l) => l.state !== "hidden");
  const methods = ["MTN Mobile Money", "Telecel Cash", "Debit or credit card"];
  const spots = ["Library", "Cafeteria", "Main gate", "Hostel A", "Hostel C"];
  const orders: AdminOrder[] = [];
  for (let d = 89; d >= 0; d--) {
    // Gentle growth with a weekend bump.
    const weekday = new Date(now - d * DAY).getUTCDay();
    const count = Math.round((2 + (90 - d) / 22) * (weekday === 0 || weekday === 6 ? 1.4 : 1) * (0.6 + rand() * 0.8));
    for (let k = 0; k < count; k++) {
      const l = pick(live);
      const qty = l.category === "food" ? 1 + Math.floor(rand() * 3) : 1;
      const amount = l.price * qty;
      const age = d * DAY + Math.floor(rand() * 20) * HOUR;
      const plan = paymentPlan(defaultConfig, {
        total: amount,
        category: l.category,
        preorder: l.category === "food",
        wantsProtection: rand() < 0.25,
      });
      const refundable = plan.kind !== "pickup";
      const status: OrderStatus =
        age < 2 * DAY ? (rand() < 0.5 ? "paid" : "ready") : refundable && rand() < 0.03 ? "refunded" : "collected";
      orders.push({
        id: `ord-${(4000 + orders.length).toString()}`,
        listingId: l.id,
        title: l.title,
        category: l.category,
        buyer: pick(buyers)[0],
        seller: l.sellerName,
        amount,
        fee: plan.fee,
        payment: plan.kind,
        paidInApp: plan.payNow,
        handedOverAt: status === "ready" && refundable && rand() < 0.6 ? now - age + 2 * HOUR : undefined,
        method: pick(methods),
        pickup: pick(spots),
        status,
        placedAt: now - age,
      });
    }
  }
  orders.reverse();

  const disputeSeeds = [
    { reason: "not-as-described", details: "The screen has a crack that wasn't in any of the photos.", state: "open" },
    { reason: "no-show", details: "Waited at the library for 40 minutes, the seller never came.", state: "open" },
    { reason: "damaged", details: "Left earbud doesn't charge.", state: "open" },
    { reason: "wrong-item", details: "Ordered the fx-991EX and got the ES Plus.", state: "refunded" },
    { reason: "not-as-described", details: "Said like new but the cover is torn.", state: "released" },
  ] as const;
  // Only held money can be disputed.
  const disputable = orders.filter((o) => o.payment !== "pickup");
  const disputes: AdminDispute[] = disputeSeeds.map((s, i) => {
    const order = disputable[1 + i * 3];
    const openedAt = now - (i * 9 + 3) * HOUR;
    if (s.state === "open") order.status = "disputed";
    else order.status = s.state === "refunded" ? "refunded" : "collected";
    return {
      id: `dsp-${210 + i}`,
      orderId: order.id,
      reason: s.reason,
      details: s.details,
      openedAt,
      state: s.state,
      messages: [
        { from: "buyer", name: order.buyer, text: s.details, at: openedAt },
        {
          from: "seller",
          name: order.seller,
          text: i % 2 ? "It was in perfect condition when I handed it over." : "Happy to sort this out, can we meet again?",
          at: openedAt + 2 * HOUR,
        },
      ],
      resolution:
        s.state === "open" ? undefined : { by: "Adjoa Mensah", at: openedAt + 20 * HOUR, note: "Checked photos from both sides." },
    };
  });

  const team: Member[] = [
    {
      id: "m-1",
      name: "Adjoa Mensah",
      email: "adjoa.mensah@ashesi.edu.gh",
      roleId: OWNER_ROLE,
      status: "active",
      invitedAt: now - 300 * DAY,
    },
    {
      id: "m-2",
      name: "Kwabena Owusu",
      email: "kwabena.owusu@ashesi.edu.gh",
      roleId: "operations",
      status: "active",
      invitedAt: now - 200 * DAY,
    },
    { id: "m-3", name: "Efua Badu", email: "efua.badu@ashesi.edu.gh", roleId: "moderator", status: "active", invitedAt: now - 90 * DAY },
    {
      id: "m-4",
      name: "Selorm Agbeko",
      email: "selorm.agbeko@ashesi.edu.gh",
      roleId: "support",
      status: "active",
      invitedAt: now - 40 * DAY,
    },
    { id: "m-5", name: "Nii Lartey", email: "nii.lartey@ashesi.edu.gh", roleId: "viewer", status: "invited", invitedAt: now - 2 * DAY },
  ];
  team.forEach((m, i) => m.status === "active" && (m.lastActiveAt = now - (i * 7 + 1) * HOUR));

  const audit: AuditEntry[] = [
    { id: "a-1", at: now - 3 * HOUR, actor: "Kwabena Owusu", permission: "orders.refund", action: "Released payout", target: orders[6].id },
    {
      id: "a-2",
      at: now - 9 * HOUR,
      actor: "Efua Badu",
      permission: "listings.moderate",
      action: "Hid listing",
      target: listings[30 % listings.length].title,
    },
    {
      id: "a-3",
      at: now - 26 * HOUR,
      actor: "Adjoa Mensah",
      permission: "settings.publish",
      action: "Published config v1",
      target: "Initial setup",
    },
    { id: "a-4", at: now - 50 * HOUR, actor: "Adjoa Mensah", permission: "team.manage", action: "Invited admin", target: "Nii Lartey" },
  ];

  return { draft: null, roles: defaultRoles, team, sessionId: null, users, listings, orders, disputes, audit };
}
