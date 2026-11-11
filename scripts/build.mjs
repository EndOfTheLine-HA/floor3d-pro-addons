import { build } from "esbuild";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const destination = resolve(root, "dist/floor3d-pro-addons.js");
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/index.js"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
  banner: {
    js: `/*! Floor3D Pro Add-ons v${pkg.version} | MIT | EndOfTheLine-HA | See LICENSE and NOTICE */`,
  },
});
const output = result.outputFiles[0].text;
if (process.argv.includes("--check")) {
  const actual = await readFile(destination, "utf8").catch(() => "");
  if (actual !== output)
    throw new Error(
      "dist/floor3d-pro-addons.js is missing or stale; run npm run build.",
    );
  console.log("Committed HACS bundle matches source.");
} else {
  await mkdir(resolve(root, "dist"), { recursive: true });
  await writeFile(destination, output);
  console.log(
    `Built dist/floor3d-pro-addons.js (${Buffer.byteLength(output)} bytes).`,
  );
}
