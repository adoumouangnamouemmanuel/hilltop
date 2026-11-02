import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), remove: vi.fn(), unsubscribe: vi.fn(), getRegistration: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: () => ({ from: () => ({ upsert: mocks.upsert, delete: () => ({ eq: mocks.remove }) }) }) }));
import { enableNotifications, forgetPushSubscription, syncPushSubscription } from "@/lib/push";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ available: true })));
  vi.stubGlobal("window", { Notification: {}, PushManager: {}, dispatchEvent: vi.fn() });
  vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn().mockResolvedValue("granted") });
  vi.stubGlobal("navigator", { serviceWorker: { getRegistration: mocks.getRegistration } });
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "dGVzdA");
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.unsubscribe.mockResolvedValue(true);
  mocks.getRegistration.mockResolvedValue({
    active: {},
    pushManager: {
      getSubscription: async () => ({
        endpoint: "https://fcm.googleapis.com/test",
        unsubscribe: mocks.unsubscribe,
        toJSON: () => ({ endpoint: "https://fcm.googleapis.com/test", keys: { p256dh: "key", auth: "auth" } }),
      }),
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("notification registration", () => {
  it("does not claim notifications are on when delivery is not configured", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ available: false })));
    await expect(enableNotifications("student")).resolves.toBe("failed");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("does not report success when the backend rejects registration", async () => {
    mocks.upsert.mockResolvedValue({ error: { code: "42501" } });
    await expect(enableNotifications("student")).resolves.toBe("failed");
  });
  it("requires a configured VAPID key", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    await expect(enableNotifications("student")).resolves.toBe("failed");
  });
  it("does not wait forever for a service worker that was never registered", async () => {
    mocks.getRegistration.mockResolvedValue(undefined);
    await expect(enableNotifications("student")).resolves.toBe("failed");
  });
  it("reports success after persisting the subscription", async () => {
    await expect(enableNotifications("student")).resolves.toBe("granted");
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });
  it("rotates an endpoint left behind by a former account instead of bypassing RLS", async () => {
    const registration = await mocks.getRegistration();
    registration.pushManager.subscribe = vi.fn().mockResolvedValue({
      toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fresh", keys: { p256dh: "new-key", auth: "new-auth" } }),
    });
    mocks.getRegistration.mockResolvedValue(registration);
    mocks.upsert.mockResolvedValueOnce({ error: { code: "42501" } }).mockResolvedValueOnce({ error: null });
    await expect(enableNotifications("new-student")).resolves.toBe("granted");
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ endpoint: "https://fcm.googleapis.com/fresh", profile_id: "new-student" }),
      expect.anything(),
    );
  });
  it("unsubscribes locally even when database deletion fails", async () => {
    mocks.remove.mockResolvedValue({ error: { code: "OFFLINE" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await forgetPushSubscription();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledOnce();
    log.mockRestore();
  });
  it("does not throw on a background registration failure", async () => {
    mocks.upsert.mockRejectedValue(new Error("Offline"));
    await expect(syncPushSubscription("student")).resolves.toBeUndefined();
  });
});
