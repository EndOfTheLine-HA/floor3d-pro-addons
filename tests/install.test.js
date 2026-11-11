import test from "node:test";
import assert from "node:assert/strict";
import { install, ADOPT } from "../src/install.js";
import { cardClass, installCanvas } from "./helpers.js";

test("missing card contract installs no partial wrappers", () => {
  const Card = cardClass();
  const original = Card.prototype.setConfig;
  Card.prototype._updatelight = undefined;
  assert.equal(install(Card).status, "unsupported");
  assert.equal(Card.prototype.setConfig, original);
  assert.equal(install(undefined).status, "unsupported");
});

test("a frozen or non-writable prototype cannot leave partial patches", () => {
  for (const freeze of [true, false]) {
    const Card = cardClass();
    const original = Card.prototype.setConfig;
    if (freeze) Object.freeze(Card.prototype);
    else
      Object.defineProperty(Card.prototype, "_initAmbient", {
        writable: false,
      });
    assert.equal(install(Card).status, "unsupported");
    assert.equal(Card.prototype.setConfig, original);
  }
});
test("duplicate loading is idempotent", () => {
  const Card = cardClass();
  assert.equal(install(Card).status, "installed");
  const installed = Card.prototype._initAmbient;
  assert.equal(install(Card).alreadyInstalled, true);
  assert.equal(Card.prototype._initAmbient, installed);
});

test("do not replace browser-cached lifecycle callbacks; hook their dynamic native calls", () => {
  const Card = cardClass();
  const connected = Card.prototype.connectedCallback;
  const disconnected = Card.prototype.disconnectedCallback;
  const cancel = Card.prototype._cancelScheduledRender;
  install(Card);
  assert.equal(Card.prototype.connectedCallback, connected);
  assert.equal(Card.prototype.disconnectedCallback, disconnected);
  assert.notEqual(Card.prototype._cancelScheduledRender, cancel);
});
test("legacy resources block stacking, and later legacy installers see their flags", () => {
  for (const name of [
    "floor3dpro.renderUpgrade.installed",
    "floor3dpro.glbHierarchyFix.installed",
  ]) {
    const Card = cardClass();
    const original = Card.prototype.setConfig;
    Card.prototype[Symbol.for(name)] = true;
    assert.equal(install(Card).status, "legacy_conflict");
    assert.equal(Card.prototype.setConfig, original);
  }
  const Card = cardClass();
  install(Card);
  assert.equal(
    Card.prototype[Symbol.for("floor3dpro.renderUpgrade.installed")],
    true,
  );
  assert.equal(
    Card.prototype[Symbol.for("floor3dpro.glbHierarchyFix.installed")],
    true,
  );
});
// Dashboard resources load in parallel, so the card can be configured before this
// bundle installs (seen in 2 of 5 cold loads in the 2026-11-11 HA test).
function captureWarnings(run) {
  const warnings = [];
  const original = console.warn;
  console.warn = (message) => warnings.push(String(message));
  try {
    run();
  } finally {
    console.warn = original;
  }
  // These bare test models have no texture, so the environment note is expected.
  return warnings.filter((message) => !message.includes("No usable texture"));
}

test("late installation adopts an already-configured card when its model loads", () => {
  installCanvas();
  const Card = cardClass();
  const card = new Card();
  card.setConfig({ render_upgrade: true });
  const warnings = captureWarnings(() => {
    install(Card);
    card._onLoaded3DModel();
  });
  assert.equal(card._renderer.outputEncoding, 3001);
  assert.equal(card._renderer.toneMapping, 4);
  assert.deepEqual(warnings, []);
});

test("late installation adopts a card whose model loaded first, through the existing-card scan", () => {
  installCanvas();
  const Card = cardClass();
  const card = new Card();
  card.setConfig({ render_upgrade: { exposure: 1.3 } });
  card._onLoaded3DModel();
  assert.equal(card._renderer.outputEncoding, 3000);
  install(Card);
  Card.prototype[ADOPT](card);
  assert.equal(card._renderer.outputEncoding, 3001);
  assert.equal(card._renderer.toneMappingExposure, 1.3);
  // Adoption is idempotent: a second scan or hook call does not reconfigure.
  Card.prototype[ADOPT](card);
  card._initAmbient();
  assert.equal(card._renderer.toneMappingExposure, 1.3);
});

test("late installation keeps native rendering for an early card with invalid add-on options", () => {
  const Card = cardClass();
  const card = new Card();
  card.setConfig({ render_upgrade: { exposure: Infinity } });
  const warnings = captureWarnings(() => {
    install(Card);
    card._initAmbient();
    card._initAmbient();
  });
  assert.equal(card._renderer.outputEncoding, 3000);
  assert.equal(card._scene.environment, null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /options are invalid; native rendering kept/);
});

test("late installation leaves cards without add-on options native", () => {
  const Card = cardClass();
  const card = new Card();
  card.setConfig({});
  install(Card);
  card._onLoaded3DModel();
  assert.equal(card._renderer.outputEncoding, 3000);
  assert.equal(card._renderer.toneMapping, 1);
});

test("the GLB reload note appears only when the model loaded before installation", () => {
  installCanvas();
  const Early = cardClass();
  const early = new Early();
  early.setConfig({ objfile: "demo.glb", render_upgrade: true });
  early._onLoaded3DModel();
  const earlyWarnings = captureWarnings(() => {
    install(Early);
    Early.prototype[ADOPT](early);
  });
  assert.equal(earlyWarnings.length, 1);
  assert.match(
    earlyWarnings[0],
    /GLB hierarchy repair applies after the next reload/,
  );

  const Later = cardClass();
  const later = new Later();
  later.setConfig({ objfile: "demo.glb", render_upgrade: true });
  const laterWarnings = captureWarnings(() => {
    install(Later);
    later._onLoaded3DModel();
    Later.prototype[ADOPT](later);
  });
  assert.deepEqual(laterWarnings, []);
  assert.equal(later._renderer.outputEncoding, 3001);
});
