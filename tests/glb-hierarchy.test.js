import test from "node:test";
import assert from "node:assert/strict";
import { install } from "../src/install.js";
import { isGlbCard } from "../src/glb-hierarchy.js";
import { THREE, cardClass } from "./helpers.js";

function fixture({ file = "demo.GLB?v=1#fixture", disabled = false } = {}) {
  const Card = cardClass();
  install(Card);
  const card = new Card();
  card.setConfig({
    objfile: file,
    glb_hierarchy_fix: !disabled,
    entities: [
      { entity: "light.demo", type3d: "light", object_id: "Demo_Lamp" },
    ],
  });
  const model = new THREE.Group();
  const group = new THREE.Group();
  group.name = "Demo_Lamp";
  group.position.set(20, 10, 0);
  group.rotation.y = 0.5;
  const a = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial(),
  );
  a.name = "Primitive_Alpha";
  a.position.x = 5;
  const b = a.clone();
  b.name = "Primitive_Beta";
  b.position.x = -5;
  group.add(a, b);
  model.add(group);
  const unrelated = a.clone();
  unrelated.name = "Demo_Lamp_1_Unrelated";
  model.add(unrelated);
  model.updateWorldMatrix(true, true);
  return { card, model, group, a, b, unrelated };
}
test("restores actual multi-material children and their original transforms, not guessed names", () => {
  const { card, model, group, a, b, unrelated } = fixture();
  const original = a.getWorldPosition(new THREE.Vector3());
  assert.equal(card._initobjects(model), "initialized");
  assert.equal(a.parent, group);
  assert.equal(b.parent, group);
  assert.notEqual(unrelated.parent, group);
  assert.ok(
    a.getWorldPosition(new THREE.Vector3()).distanceTo(original) < 1e-9,
  );
  assert.deepEqual(card._floor3dproGlbHierarchyFix, {
    attachedMeshes: 2,
    reconciledGroups: 1,
  });
});
test("OBJ and explicitly disabled GLB cards keep native hierarchy", () => {
  for (const options of [{ file: "demo.obj" }, { disabled: true }]) {
    const { card, model, group, a } = fixture(options);
    card._initobjects(model);
    assert.notEqual(a.parent, group);
  }
});
test("single primitive groups are left alone", () => {
  const { card, model, group, b, a } = fixture();
  group.remove(b);
  card._initobjects(model);
  assert.notEqual(a.parent, group);
});
test("only same-level primitives are restored", () => {
  const { card, model, group, a, b } = fixture();
  card._initobjects(model);
  const other = new THREE.Group();
  other.add(a, b);
  card._levels.push(other);
  // A new native load captures no two direct children under group; cannot steal others.
  card._initobjects(model);
  assert.equal(group.children.length, 0);
  assert.equal(a.parent, other);
});
test("click resolves unbound primitive to its nearest configured light ancestor", () => {
  const { card, model, group, a } = fixture();
  card._initobjects(model);
  card.intersections = [{ object: a, distance: 1 }];
  const original = card._getintersect;
  assert.equal(card._firEvent({}), "clicked");
  assert.equal(card.clicked, group);
  assert.equal(card._getintersect, original);
  assert.equal(Object.hasOwn(card, "_getintersect"), false);
});
test("explicit primitive bindings and selection mode take precedence", () => {
  const { card, model, group, a } = fixture();
  card._initobjects(model);
  card.intersections = [{ object: a }];
  card._object_ids.push({ objects: [{ object_id: a.name }] });
  card._firEvent({});
  assert.equal(card.clicked, a);
  card._object_ids.pop();
  card._selectionModeEnabled = true;
  card._firEvent({});
  assert.equal(card.clicked, a);
  card._selectionModeEnabled = false;
  card._config.entities[0].type3d = "show";
  card._firEvent({});
  assert.equal(card.clicked, a);
  assert.notEqual(card.clicked, group);
});
test("empty hits and unrelated objects pass through", () => {
  const { card, model, unrelated } = fixture();
  card._initobjects(model);
  card._firEvent({});
  assert.equal(card.clicked, undefined);
  card.intersections = [{ object: unrelated }];
  card._firEvent({});
  assert.equal(card.clicked, unrelated);
});
test("native exceptions restore any instance-owned intersection getter", () => {
  const { card, model, a } = fixture();
  card._initobjects(model);
  const getter = () => [{ object: a }];
  card._getintersect = getter;
  card.throwOnClick = true;
  assert.throws(() => card._firEvent({}), /native-click-error/);
  assert.equal(card._getintersect, getter);
  assert.equal(Object.hasOwn(card, "_getintersect"), true);
});
test("URL handling only recognizes GLB extension before query/fragment", () => {
  assert.equal(isGlbCard({ _config: { objfile: "fixture.GLB#mesh" } }), true);
  assert.equal(
    isGlbCard({ _config: { objfile: "fixture.obj?x=.glb" } }),
    false,
  );
});
