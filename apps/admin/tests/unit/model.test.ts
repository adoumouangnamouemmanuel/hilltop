import { describe, expect, it } from "vitest";
import { defaultConfig } from "@hilltop/shared/config";
import { OWNER_ROLE, togglePermission } from "@hilltop/shared/permissions";
import {
  allowed,
  changeMemberRole,
  deleteRole,
  editDraft,
  Forbidden,
  inviteMember,
  Rejected,
  refundOrder,
  removeMember,
  resolveDispute,
  saveRole,
  setListingState,
  setSuspended,
  setVerified,
} from "@/lib/model";
import { seedState } from "@/lib/seed";
import type { AdminState } from "@/lib/types";

const NOW = Date.UTC(2026, 10, 1, 12);
const as = (memberId: string): AdminState => ({ ...seedState(NOW), sessionId: memberId });
const OWNER = "m-1";
const MODERATOR = "m-3";
const SUPPORT = "m-4";

describe("permissions", () => {
  it("lets the owner do everything", () => {
    const s = as(OWNER);
    expect(allowed(s, "settings.publish")).toBe(true);
    expect(allowed(s, "team.manage")).toBe(true);
  });

  it("blocks actions outside a role", () => {
    const s = as(SUPPORT);
    expect(() => setSuspended(s, s.users[0].id, true, NOW)).toThrow(Forbidden);
    expect(() => editDraft(s, defaultConfig, "settings.edit", "x", (c) => c, NOW)).toThrow(Forbidden);
  });

  it("refuses everything without a signed-in member", () => {
    const s = { ...seedState(NOW), sessionId: null };
    expect(allowed(s, "dashboard.view")).toBe(false);
    expect(() => setVerified(s, s.users[0].id, true, NOW)).toThrow(Forbidden);
  });

  it("applies permission changes to the role immediately", () => {
    let s = as(MODERATOR);
    expect(allowed(s, "orders.view")).toBe(false);
    s = saveRole(
      { ...s, sessionId: OWNER },
      togglePermission(
        s.roles.find((r) => r.id === "moderator")!,
        "orders.view",
      ),
      NOW,
    );
    expect(allowed({ ...s, sessionId: MODERATOR }, "orders.view")).toBe(true);
  });

  it("never strips permissions from the owner role", () => {
    const s = as(OWNER);
    const owner = s.roles.find((r) => r.id === OWNER_ROLE)!;
    const saved = saveRole(s, { ...owner, name: "Founder", permissions: [] }, NOW).roles.find((r) => r.id === OWNER_ROLE)!;
    expect(saved.name).toBe("Founder");
    expect(saved.permissions.length).toBe(owner.permissions.length);
  });
});

describe("audit log", () => {
  it("records who did what", () => {
    const s = as(MODERATOR);
    const listing = s.listings[0];
    const next = setListingState(s, listing.id, "hidden", NOW);
    expect(next.audit[0]).toMatchObject({
      actor: "Efua Badu",
      permission: "listings.moderate",
      action: "Hid listing",
      target: listing.title,
      at: NOW,
    });
    expect(next.listings[0].state).toBe("hidden");
  });
});

describe("users and listings", () => {
  it("hides a suspended seller's live listings", () => {
    const s = as(OWNER);
    const seller = s.listings.find((l) => l.state === "live")!.sellerId;
    const next = setSuspended(s, seller, true, NOW);
    expect(next.listings.filter((l) => l.sellerId === seller).some((l) => l.state === "live")).toBe(false);
  });

  it("closes reports when a listing is moderated", () => {
    const s = as(OWNER);
    const reported = s.listings.find((l) => l.reports.length)!;
    expect(setListingState(s, reported.id, "hidden", NOW).listings.find((l) => l.id === reported.id)!.reports).toEqual([]);
  });
});

describe("orders and disputes", () => {
  it("can't refund an order twice", () => {
    const s = as(OWNER);
    const open = s.orders.find((o) => o.status === "paid")!;
    const once = refundOrder(s, open.id, NOW);
    expect(() => refundOrder(once, open.id, NOW)).toThrow(Rejected);
  });

  it("has nothing to refund or release on pay-at-pickup orders", () => {
    const s = as(OWNER);
    const pickup = s.orders.find((o) => o.payment === "pickup" && o.status === "paid")!;
    expect(() => refundOrder(s, pickup.id, NOW)).toThrow(Rejected);
  });

  it("only opens disputes on orders with held money", () => {
    const s = as(OWNER);
    for (const d of s.disputes) expect(s.orders.find((o) => o.id === d.orderId)!.payment).not.toBe("pickup");
  });

  it("settles the order when a dispute is resolved", () => {
    const s = as(SUPPORT);
    const d = s.disputes.find((x) => x.state === "open")!;
    const next = resolveDispute(s, d.id, "refunded", "Photos show the crack", NOW);
    expect(next.disputes.find((x) => x.id === d.id)).toMatchObject({ state: "refunded", resolution: { by: "Selorm Agbeko" } });
    expect(next.orders.find((o) => o.id === d.orderId)!.status).toBe("refunded");
    expect(() => resolveDispute(next, d.id, "released", "", NOW)).toThrow(Rejected);
  });
});

describe("team safeguards", () => {
  it("keeps at least one owner", () => {
    expect(() => changeMemberRole(as(OWNER), OWNER, "viewer", NOW)).toThrow(Rejected);
  });

  it("stops admins removing themselves", () => {
    expect(() => removeMember(as(OWNER), OWNER, NOW)).toThrow(Rejected);
  });

  it("rejects duplicate invites", () => {
    const s = as(OWNER);
    expect(() => inviteMember(s, { name: "X", email: s.team[1].email.toUpperCase(), roleId: "viewer" }, NOW)).toThrow(Rejected);
    const next = inviteMember(s, { name: "Ama", email: "ama@ashesi.edu.gh", roleId: "support" }, NOW);
    expect(next.team.at(-1)).toMatchObject({ email: "ama@ashesi.edu.gh", status: "invited", roleId: "support" });
  });

  it("moves members when their role is deleted, and never deletes the owner role", () => {
    let s = as(OWNER);
    s = saveRole(s, { id: "interns", name: "Interns", description: "", permissions: ["dashboard.view"] }, NOW);
    s = changeMemberRole(s, "m-5", "interns", NOW);
    s = deleteRole(s, "interns", "viewer", NOW);
    expect(s.team.find((m) => m.id === "m-5")!.roleId).toBe("viewer");
    expect(() => deleteRole(s, OWNER_ROLE, "viewer", NOW)).toThrow(Rejected);
  });
});

describe("drafts", () => {
  it("clears the draft when edits return to what's published", () => {
    const s = as(OWNER);
    const changed = editDraft(
      s,
      defaultConfig,
      "settings.edit",
      "fee",
      (c) => ({ ...c, fees: { ...c.fees, buyerProtectionRate: 0.03 } }),
      NOW,
    );
    expect(changed.draft?.fees.buyerProtectionRate).toBe(0.03);
    const reverted = editDraft(
      changed,
      defaultConfig,
      "settings.edit",
      "fee",
      (c) => ({ ...c, fees: { ...c.fees, buyerProtectionRate: 0.04 } }),
      NOW,
    );
    expect(reverted.draft).toBeNull();
  });

  it("keeps catalog and settings permissions separate", () => {
    expect(() => editDraft(as(MODERATOR), defaultConfig, "catalog.edit", "x", (c) => ({ ...c, categories: [] }), NOW)).toThrow(Forbidden);
  });
});
