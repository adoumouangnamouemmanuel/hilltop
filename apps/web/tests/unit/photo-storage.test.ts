import { afterEach, describe, expect, it, vi } from "vitest";
const context = vi.hoisted(() => vi.fn());
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: context }));
import { storePhoto } from "@/lib/photos-server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("durable photo storage", () => {
  it("fails a production upload when the bucket is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_MEMORY_PHOTOS", "");
    context.mockRejectedValue(new Error("Missing binding"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(storePhoto("photo.jpg", new ArrayBuffer(2), "image/jpeg", "https://market.example")).rejects.toThrow(
      "temporarily unavailable",
    );
    log.mockRestore();
  });
  it("cannot enable memory storage on a public host with the test flag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_MEMORY_PHOTOS", "true");
    context.mockResolvedValue({ env: {} });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(storePhoto("photo.jpg", new ArrayBuffer(2), "image/jpeg", "https://market.example")).rejects.toThrow(
      "temporarily unavailable",
    );
    log.mockRestore();
  });
  it("returns a durable public URL only after the bucket accepts the write", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    context.mockResolvedValue({ env: { PHOTOS: { put }, PHOTOS_URL: "https://photos.example" } });
    await expect(storePhoto("photo.jpg", new ArrayBuffer(2), "image/jpeg", "https://market.example")).resolves.toBe(
      "https://photos.example/photo.jpg",
    );
    expect(put).toHaveBeenCalledOnce();
  });
  it("propagates bucket write failures instead of returning an unusable URL", async () => {
    context.mockResolvedValue({ env: { PHOTOS: { put: vi.fn().mockRejectedValue(new Error("Storage down")) } } });
    await expect(storePhoto("photo.jpg", new ArrayBuffer(2), "image/jpeg", "https://market.example")).rejects.toThrow("Storage down");
  });
});
