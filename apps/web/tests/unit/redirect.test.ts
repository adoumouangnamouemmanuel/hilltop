import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/redirect";

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/me?tab=selling")).toBe("/me?tab=selling");
    expect(safeNext("/listing/casio-fx991#reviews")).toBe("/listing/casio-fx991#reviews");
  });

  it.each(["//evil.com", "/\\evil.com", "/\t/evil.com", "https://evil.com", "%2f%2fevil.com", "/\\\\evil.com/x", "/%5Cevil.com", "", null])(
    "never leaves the site for %j",
    (next) => {
      // Whatever comes back, a browser resolves it on this origin.
      expect(new URL(safeNext(next), "https://hilltop.lumavok.com").origin).toBe("https://hilltop.lumavok.com");
    },
  );

  it("falls back for anything a browser could read as another site", () => {
    for (const next of ["//evil.com", "/\\evil.com", "/\t/evil.com", "https://evil.com"]) expect(safeNext(next)).toBe("/");
  });
});
