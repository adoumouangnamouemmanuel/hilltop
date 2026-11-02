import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), deliver: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/web-push", () => ({
  isPushService: (endpoint: string) => endpoint.startsWith("https://fcm.googleapis.com/"),
  deliverPush: mocks.deliver,
}));
import { POST } from "@/app/api/push/route";
const job = {
  id: "job",
  lease: "lease",
  endpoint: "https://fcm.googleapis.com/test",
  p256dh: "key",
  auth: "auth",
  title: "Message",
  body: "Hello",
  href: "/inbox",
  tag: "note",
};
const request = (secret = "secret", body = "{}") =>
  new Request("https://example.com/api/push", { method: "POST", headers: { "x-hilltop-webhook": secret }, body });
beforeEach(() => {
  vi.stubEnv("PUSH_WEBHOOK_SECRET", "secret");
  vi.stubEnv("SUPABASE_SECRET_KEY", "server");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private");
  mocks.rpc.mockImplementation(async (name) => (name === "claim_push_deliveries" ? { data: [job], error: null } : { error: null }));
  mocks.deliver.mockResolvedValue({ status: 201, retrySeconds: 0 });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("push delivery endpoint", () => {
  it("rejects an invalid webhook secret without touching jobs", async () => {
    expect((await POST(request("wrong"))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns unavailable when claiming jobs fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "OFFLINE" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request())).status).toBe(503);
    expect(mocks.deliver).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it("records provider acceptance with the job lease", async () => {
    expect(await (await POST(request())).json()).toMatchObject({ sent: 1, failed: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith("finish_push_delivery", { p_id: "job", p_lease: "lease", p_status: 201, p_retry_seconds: 0 });
  });
  it("persists transient errors and Retry-After for the retry scheduler", async () => {
    mocks.deliver.mockResolvedValue({ status: 429, retrySeconds: 300 });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await (await POST(request())).json()).toMatchObject({ sent: 0, failed: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("finish_push_delivery", expect.objectContaining({ p_status: 429, p_retry_seconds: 300 }));
    log.mockRestore();
  });
  it("records network exceptions as retryable instead of marking delivered", async () => {
    mocks.deliver.mockRejectedValue(new Error("Offline"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await POST(request());
    expect(mocks.rpc).toHaveBeenCalledWith("finish_push_delivery", expect.objectContaining({ p_status: 0 }));
    log.mockRestore();
  });
});
