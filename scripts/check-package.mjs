import { readFile, readdir } from "node:fs/promises";
import { resolve, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import assert from "node:assert/strict";
import { demoGlb } from "./generate-demo.mjs";
import { VERSION } from "../src/options.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(resolve(root, "hacs.json"), "utf8"));
assert.equal(pkg.name, "floor3d-pro-addons");
assert.equal(pkg.version, VERSION);
assert.equal(manifest.filename, `${pkg.name}.js`);
assert.equal(manifest.name, "Floor3D Pro Add-ons");
assert.equal(manifest.render_readme, true);
assert.deepEqual(await readdir(resolve(root, "dist")), [manifest.filename]);
const bundle = await readFile(resolve(root, "dist", manifest.filename), "utf8");
new Script(bundle, { filename: manifest.filename });
assert.equal(
  /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(bundle),
  false,
  "Runtime bundle must not initiate network connections",
);
assert.equal(
  /callService|callWS/.test(bundle),
  false,
  "Runtime bundle must not call HA services",
);
assert.equal(
  /\b(?:import|require)\s*\(/.test(bundle),
  false,
  "Runtime bundle must be self-contained",
);
assert.deepEqual(
  await readFile(resolve(root, "examples/demo.glb")),
  demoGlb(),
  "Only reproducibly generated synthetic geometry belongs here",
);
const forbidden = [
  /\b192\.168\.\d{1,3}\.\d{1,3}\b/,
  /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  /\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/,
  /[A-Z]:[\\/]Users[\\/]/i,
  /b64:[a-z0-9+/]{40,}/i,
];
let count = 0;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", "coverage", ".cache"].includes(entry.name))
      continue;
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Unexpected symbolic link: ${relative(root, path)}`);
    if (entry.isDirectory()) {
      await scan(path);
      continue;
    }
    count++;
    if ([".png", ".glb"].includes(extname(path))) {
      assert.ok(
        ["examples/demo.glb", "docs/images/demo.png"].includes(
          relative(root, path).replaceAll("\\", "/"),
        ),
        "Unexpected binary asset",
      );
      continue;
    }
    const text = await readFile(path, "utf8");
    // The expressions in this scanner are escaped source, not real private addresses.
    for (const pattern of forbidden)
      assert.equal(
        pattern.test(text),
        false,
        `Private data pattern in ${relative(root, path)}`,
      );
  }
}
await scan(root);
for (const file of [
  "README.md",
  "LICENSE",
  "NOTICE",
  "CHANGELOG.md",
  "AUDIT.md",
  ".github/workflows/validate.yml",
])
  assert.ok((await readFile(resolve(root, file), "utf8")).length > 0);
console.log(
  `Local packaging, bundle syntax, synthetic-model reproducibility and privacy-pattern checks passed (${count} files).`,
);
console.log(
  "Official HACS validation requires the published GitHub repository; it is configured in CI, not claimed by this local check.",
);
