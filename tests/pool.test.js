import test from "node:test";
import assert from "node:assert/strict";
import { THREE } from "./helpers.js";
import {
  fitToCapacity,
  fluxOf,
  mergeCost,
  mergeItems,
  placeLight,
} from "../src/pool.js";

function item({
  x = 0,
  entity = 0,
  shadow = false,
  spot = true,
  intensity = 2,
} = {}) {
  return {
    position: new THREE.Vector3(x, 100, 0),
    direction: new THREE.Vector3(0, -1, 0),
    color: new THREE.Color(0xffffff),
    intensity,
    distance: 500,
    decay: 1,
    angle: Math.PI / 6,
    penumbra: 0.5,
    spot,
    shadow,
    entity,
  };
}
test("merging preserves total flux without mutating its inputs", () => {
  const a = item();
  const b = item({ x: 100 });
  const before = a.position.clone();
  const merged = mergeItems(a, b);
  assert.ok(Math.abs(fluxOf(merged) - fluxOf(a) - fluxOf(b)) < 1e-9);
  assert.deepEqual(a.position, before);
  assert.equal(merged.members.length, 2);
  assert.equal(merged.position.x, 50);
});
test("point lights preserve summed intensity and weighted colour", () => {
  const merged = mergeItems(
    item({ spot: false, intensity: 1 }),
    item({ spot: false, intensity: 3, x: 100 }),
  );
  assert.equal(merged.intensity, 4);
  assert.equal(merged.position.x, 75);
});
test("do not merge incompatible types, shadow classes, far fixtures, or opposite aims", () => {
  assert.equal(mergeCost(item(), item({ spot: false })), null);
  assert.equal(mergeCost(item(), item({ shadow: true })), null);
  assert.equal(
    mergeCost(item({ shadow: true }), item({ shadow: true, entity: 1 })),
    null,
  );
  assert.equal(mergeCost(item(), item({ x: 1000 })), null);
  const opposite = item();
  opposite.direction.negate();
  assert.equal(mergeCost(item(), opposite), null);
});
test("overflow merges first, then drops the weakest incompatible item", () => {
  const tally = { merged: 0, dropped: 0 };
  const result = fitToCapacity(
    [item(), item({ x: 100 }), item({ x: 2000, intensity: 0.1 })],
    1,
    tally,
  );
  assert.equal(result.length, 1);
  assert.equal(tally.merged, 1);
  assert.equal(tally.dropped, 1);
  assert.equal(result[0].members.length, 2);
});
test("shadow overflow is returned for unshadowed slots rather than silently dropped", () => {
  const tally = { merged: 0, dropped: 0 };
  const overflow = [];
  const result = fitToCapacity(
    [item({ shadow: true }), item({ shadow: true, entity: 1 })],
    1,
    tally,
    overflow,
  );
  assert.equal(result.length, 1);
  assert.equal(overflow.length, 1);
  assert.equal(tally.dropped, 0);
});
test("zero capacity and unused slots are safe", () => {
  const tally = { merged: 0, dropped: 0 };
  assert.deepEqual(fitToCapacity([item()], 0, tally), []);
  assert.equal(tally.dropped, 1);
  const light = new THREE.SpotLight(0xffffff, 10);
  placeLight(light);
  assert.equal(light.intensity, 0);
  placeLight(light, item({ intensity: 3 }));
  assert.equal(light.intensity, 3);
  assert.equal(light.target.position.y, 0);
});
