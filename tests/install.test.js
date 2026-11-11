import test from "node:test";
import assert from "node:assert/strict";
import { install } from "../src/install.js";
import { cardClass } from "./helpers.js";

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
test("late installation does not change an already-configured renderer until reload/reconfigure", () => {
  const Card = cardClass();
  const card = new Card();
  card.setConfig({ render_upgrade: true });
  install(Card);
  card._initAmbient();
  assert.equal(card._renderer.outputEncoding, 3000);
  assert.equal(card._scene.environment, null);
});
