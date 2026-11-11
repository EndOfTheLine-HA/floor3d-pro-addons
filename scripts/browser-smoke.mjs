import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = resolve(
    root,
    `.${decodeURIComponent(pathname === "/" ? "/tests/browser/harness.html" : pathname)}`,
  );
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    const type =
      {
        ".js": "text/javascript",
        ".html": "text/html",
        ".glb": "model/gltf-binary",
      }[extname(file)] ?? "application/octet-stream";
    response
      .writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" })
      .end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && process.platform === "win32") {
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  if (await stat(chrome).catch(() => null)) executablePath = chrome;
}
let browser;
try {
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 960, height: 720 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  const loadErrors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      loadErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) =>
    loadErrors.push(`${request.failure()?.errorText} ${request.url()}`),
  );
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  try {
    await page.waitForFunction(
      () => window.smokeResult || window.smokeError,
      undefined,
      { timeout: 30000 },
    );
  } catch (error) {
    throw new Error(
      `Browser harness did not complete: ${JSON.stringify({ errors, loadErrors })}`,
      { cause: error },
    );
  }
  const result = await page.evaluate(() => ({
    result: window.smokeResult,
    error: window.smokeError,
  }));
  assert.equal(result.error, undefined);
  assert.deepEqual(errors, []);
  assert.equal(result.result.status, "installed");
  assert.equal(result.result.meshesRestored, 2);
  assert.equal(result.result.pooledLights, 2);
  assert.equal(result.result.encoding, 3001);
  assert.equal(result.result.lightCountStable, true);
  assert.equal(result.result.reconnected, true);
  assert.equal(result.result.cleanup, true);
  assert.ok(result.result.programs > 0);
  if (process.argv.includes("--screenshot")) {
    await mkdir(resolve(root, "docs/images"), { recursive: true });
    await page
      .locator("main")
      .screenshot({ path: resolve(root, "docs/images/demo.png") });
  }
  console.log(
    JSON.stringify(
      {
        browser: browser.version(),
        ...result.result,
        pageErrors: errors.length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
