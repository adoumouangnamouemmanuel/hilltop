import { describe, expect, it } from "vitest";
import { cleanImage } from "@/lib/image-metadata";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

const segment = (marker: number, body: number[]) => [0xff, marker, ((body.length + 2) >> 8) & 0xff, (body.length + 2) & 0xff, ...body];

// A tiny JPEG: SOI, JFIF, EXIF with "GPS", a comment, a 640x480 frame, a scan, EOI, then appended data.
const jpeg = bytes(
  [0xff, 0xd8],
  segment(0xe0, [..."JFIF\0".split("").map((c) => c.charCodeAt(0)), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
  segment(0xe1, [..."Exif\0\0GPS-5.6037,-0.1870".split("").map((c) => c.charCodeAt(0))]),
  segment(0xfe, [..."secret comment".split("").map((c) => c.charCodeAt(0))]),
  segment(0xc0, [8, 0x01, 0xe0, 0x02, 0x80, 1, 1, 0x11, 0]),
  segment(0xda, [1, 1, 0, 0, 0x3f, 0]),
  [0x12, 0x34, 0x56],
  [0xff, 0xd9],
  "<script>alert(1)</script>",
);

const text = (b: Uint8Array) => String.fromCharCode(...b);

describe("cleanImage", () => {
  it("drops EXIF, comments and anything after a JPEG", () => {
    const cleaned = cleanImage(jpeg, "image/jpeg")!;
    expect(cleaned).toMatchObject({ width: 640, height: 480 });
    expect(text(cleaned.bytes)).not.toContain("GPS");
    expect(text(cleaned.bytes)).not.toContain("secret comment");
    expect(text(cleaned.bytes)).not.toContain("<script>");
    expect(text(cleaned.bytes)).toContain("JFIF");
    expect([...cleaned.bytes.slice(-2)]).toEqual([0xff, 0xd9]);
  });

  it("refuses files that only start like an image", () => {
    expect(cleanImage(bytes([0xff, 0xd8, 0xff, 0xe0, 0x00]), "image/jpeg")).toBeNull();
    expect(cleanImage(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toBeNull();
  });

  it("drops text chunks from a PNG and stops at its end", () => {
    const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...bytes(type), ...data, 0, 0, 0, 0];
    const png = bytes(
      [0x89],
      "PNG",
      [0x0d, 0x0a, 0x1a, 0x0a],
      chunk("IHDR", [0, 0, 1, 0, 0, 0, 0, 0x80, 8, 2, 0, 0, 0]),
      chunk("tEXt", [...bytes("Author\0Somebody")]),
      chunk("IDAT", [1, 2, 3]),
      chunk("IEND", []),
      "trailing",
    );
    const cleaned = cleanImage(png, "image/png")!;
    expect(cleaned).toMatchObject({ width: 256, height: 128 });
    expect(text(cleaned.bytes)).not.toContain("Somebody");
    expect(text(cleaned.bytes)).not.toContain("trailing");
  });
});
