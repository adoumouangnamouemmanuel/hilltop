import { afterEach, describe, expect, it, vi } from "vitest";
import { compressImage } from "@/lib/images";

afterEach(() => vi.unstubAllGlobals());

function canvas() {
  const drawImage = vi.fn();
  const element = { width: 0, height: 0, getContext: () => ({ drawImage }), toDataURL: () => "data:image/jpeg;base64,converted" };
  vi.stubGlobal("document", { createElement: () => element });
  return element;
}

describe("photo preparation", () => {
  it("resizes a decoded camera image and releases its bitmap", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4000, height: 3000, close }));
    const output = canvas();
    await expect(compressImage(new File(["photo"], "photo.jpg"))).resolves.toContain("data:image/jpeg");
    expect([output.width, output.height]).toEqual([1600, 1200]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("converts HEIC when the native image element can decode it", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("Unsupported")));
    vi.stubGlobal(
      "Image",
      class {
        width = 2000;
        height = 1000;
        decode = vi.fn().mockResolvedValue(undefined);
      },
    );
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:photo", revokeObjectURL });
    canvas();
    await expect(compressImage(new File(["heic"], "photo.heic"))).resolves.toContain("data:image/jpeg");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:photo");
  });

  it("rejects unsupported HEIC with actionable guidance instead of returning raw bytes", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("Unsupported")));
    vi.stubGlobal(
      "Image",
      class {
        decode = vi.fn().mockRejectedValue(new Error("Unsupported"));
      },
    );
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:photo", revokeObjectURL });
    await expect(compressImage(new File(["heic"], "photo.HEIC"))).rejects.toThrow("export it as JPEG");
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("releases a decoded bitmap when canvas allocation fails", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4000, height: 3000, close }));
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
    await expect(compressImage(new File(["photo"], "photo.jpg"))).rejects.toThrow("Couldn't prepare this photo");
    expect(close).toHaveBeenCalledOnce();
  });
});
