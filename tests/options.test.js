import test from "node:test";
import assert from "node:assert/strict";
import { parseOptions, hierarchyEnabled } from "../src/options.js";

test("rendering is opt-in; GLB compatibility is enabled by default", () => {
  for (const value of [undefined, null, false, "no"])
    assert.equal(parseOptions({ render_upgrade: value }), null);
  assert.equal(hierarchyEnabled({}), true);
  assert.equal(hierarchyEnabled({ glb_hierarchy_fix: false }), false);
});
test("defaults, native-sky bypass, and immutable caller configuration", () => {
  const config = { render_upgrade: { light_pool: { spots: 2, points: 0 } } };
  const before = structuredClone(config);
  const options = parseOptions(config);
  assert.equal(options.exposure, 1.6);
  assert.equal(options.light_pool.shadows, 2);
  assert.ok(Object.isFrozen(options.light_pool));
  assert.deepEqual(config, before);
  assert.equal(parseOptions({ render_upgrade: true, sky: "yes" }), null);
});
for (const value of ["false", "on", [], 1])
  test(`reject ambiguous render_upgrade ${JSON.stringify(value)}`, () => {
    assert.throws(() => parseOptions({ render_upgrade: value }));
  });
for (const [key, value] of [
  ["exposure", NaN],
  ["exposure", Infinity],
  ["ambient", -1],
  ["torch", "1"],
  ["hide_off_lights", "false"],
  ["cast_shadows", "no"],
  ["pixel_ratio", 0],
  ["pixel_ratio", 100],
  ["hass_render_ms", 1.5],
  ["hass_render_ms", 60001],
  ["hass_render", "sometimes"],
  ["screens", {}],
])
  test(`reject invalid ${key} ${JSON.stringify(value)}`, () => {
    assert.throws(() => parseOptions({ render_upgrade: { [key]: value } }));
  });
for (const value of [
  { spots: -1 },
  { spots: Infinity },
  { spots: 65 },
  { points: 17 },
  { spots: 1.5 },
  { shadows: -1 },
  { point_shadows: "false" },
  { spots: 0, points: 0 },
  { decals: [] },
])
  test(`bound pool configuration ${JSON.stringify(value)}`, () => {
    assert.throws(() =>
      parseOptions({ render_upgrade: { light_pool: value } }),
    );
  });
test("allow deliberately zero spot or point slots, but reject ambiguous flags", () => {
  assert.equal(
    parseOptions({ render_upgrade: { light_pool: { spots: 0, points: 1 } } })
      .light_pool.shadows,
    0,
  );
  assert.throws(() => hierarchyEnabled({ glb_hierarchy_fix: "no" }));
});
