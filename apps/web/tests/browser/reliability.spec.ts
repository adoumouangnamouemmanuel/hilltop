import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import ts from "typescript";

const resolveModule = createRequire(resolve("package.json"));
let server: Server;
let origin: string;
test.beforeAll(async () => {
  const source = await readFile(resolve("src/lib/images.ts"), "utf8");
  const compiled = ts
    .transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
    .outputText.replace('"heic-to/csp"', '"/heic.js"');
  const decoder = await readFile(resolveModule.resolve("heic-to/csp"));
  const fixture = await readFile(resolve("tests/browser/fixtures/sample.heic"));
  const worker = await readFile(resolve("public/sw.js"));
  server = createServer((request, response) => {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data: blob:; connect-src 'self' data: blob:",
    );
    if (request.url === "/images.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(compiled);
    } else if (request.url === "/heic.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(decoder);
    } else if (request.url === "/sample.heic") {
      response.end(fixture);
    } else if (request.url === "/sw.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(worker);
    } else {
      response.setHeader("content-type", "text/html");
      response.end(
        `<p>${request.url === "/offline" ? "Offline fallback" : request.url === "/inbox" ? "Private inbox" : "Ready"}</p><script type="module">import { compressImage } from '/images.js'; window.compressImage = compressImage;</script>`,
      );
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  await new Promise<void>((done, reject) => server.close((error) => (error ? reject(error) : done())));
});

test("converts a real HEIC on Chromium under production-style CSP", async ({ page }) => {
  // Explicitly exercise the fallback even on machines with a native HEIC codec.
  await page.addInitScript(() => {
    const bitmap = window.createImageBitmap.bind(window);
    window.createImageBitmap = ((source: ImageBitmapSource) =>
      source instanceof File
        ? Promise.reject(new Error("Native file decoding disabled for this regression"))
        : bitmap(source)) as typeof window.createImageBitmap;
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      return this.src.startsWith("blob:") ? Promise.reject(new Error("Native decoding disabled")) : decode.call(this);
    };
  });
  let decoderRequested = false;
  page.on("response", (response) => {
    if (response.url().endsWith("/heic.js")) decoderRequested = true;
  });
  await page.goto(origin);
  await page.waitForFunction(() => "compressImage" in window);
  const result = await page.evaluate(async () => {
    const blob = await (await fetch("/sample.heic")).blob();
    const compress = (window as unknown as { compressImage: (file: File) => Promise<string> }).compressImage;
    const url = await compress(new File([blob], "iphone.heic", { type: "image/heic" }));
    const image = new Image();
    image.src = url;
    await image.decode();
    return { prefix: url.slice(0, 23), width: image.naturalWidth, height: image.naturalHeight };
  });
  expect(result.prefix).toBe("data:image/jpeg;base64,");
  expect(result.width).toBeGreaterThan(0);
  expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(1600);
  expect(decoderRequested).toBe(true);
});

test("reports corrupt HEIC as an actionable error", async ({ page }) => {
  await page.goto(origin);
  await page.waitForFunction(() => "compressImage" in window);
  const error = await page.evaluate(async () => {
    try {
      await (window as unknown as { compressImage: (file: File) => Promise<string> }).compressImage(new File(["broken"], "broken.heic"));
      return "unexpected success";
    } catch (failure) {
      return failure instanceof Error ? failure.message : String(failure);
    }
  });
  expect(error).toContain("Couldn't convert this HEIC");
});

test("private navigation is not cached for offline replay", async ({ page, context }) => {
  await page.goto(origin);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.goto(`${origin}/inbox`);
  await expect(page.getByText("Private inbox")).toBeVisible();
  const cached = await page.evaluate(async () => !!(await caches.match(new Request(`${location.origin}/inbox`))));
  expect(cached).toBe(false);
  await context.setOffline(true);
  await page.goto(`${origin}/inbox`);
  await expect(page.getByText("Offline fallback")).toBeVisible();
  await context.setOffline(false);
});
