import test from "node:test";
import assert from "node:assert/strict";
import { install } from "../src/install.js";
import { safely } from "../src/render-upgrade.js";
import {
  cardClass,
  THREE,
  installCanvas,
  texturedModel,
  addLight,
  wait,
} from "./helpers.js";

installCanvas();
function make(options = true, { light = true, texture = true } = {}) {
  const Card = cardClass();
  install(Card);
  const card = new Card();
  card.setConfig({
    objfile: "demo.glb",
    entities: [
      { entity: "light.demo", type3d: "light", object_id: "Demo_Lamp" },
    ],
    render_upgrade: options,
  });
  const mesh = texture
    ? texturedModel().mesh
    : new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  card._scene.add(mesh);
  const source = light ? addLight(card) : null;
  card._onLoaded3DModel();
  return { card, source, mesh };
}
test("native cards remain unmodified unless rendering is opted in", () => {
  const { card, source } = make(false);
  assert.equal(card._renderer.outputEncoding, THREE.LinearEncoding);
  assert.equal(card._scene.environment, null);
  assert.equal(source.visible, true);
});
test("enable color correction, tone mapping and generated environment", () => {
  const { card } = make({ exposure: 1.8, ambient: 0.2, torch: 0.4 });
  assert.equal(card._renderer.outputEncoding, THREE.sRGBEncoding);
  assert.equal(card._renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(card._renderer.toneMappingExposure, 1.8);
  assert.equal(card._ambient_light.intensity, 0.2);
  assert.equal(card._torch.intensity, 0.4);
  assert.ok(card._scene.environment.isTexture);
  assert.equal(
    card._scene.environment.mapping,
    THREE.EquirectangularReflectionMapping,
  );
});
test("missing textures degrade gracefully, and a pre-existing environment is never replaced/disposed", () => {
  const { card } = make(true, { texture: false });
  assert.equal(card._scene.environment, null);
  assert.equal(card._renderer.outputEncoding, THREE.sRGBEncoding);
  const existing = new THREE.Texture();
  let disposed = false;
  existing.addEventListener("dispose", () => {
    disposed = true;
  });
  card.setConfig({ render_upgrade: false });
  card._scene.environment = existing;
  card.setConfig({ render_upgrade: true });
  card.disconnectedCallback();
  assert.equal(card._scene.environment, existing);
  assert.equal(disposed, false);
});
test("disconnect restores all owned changes and disposes only the generated environment", () => {
  const { card, mesh, source } = make({
    light_pool: { spots: 2, points: 0 },
    cast_shadows: false,
  });
  const environment = card._scene.environment;
  let disposed = 0;
  let geometryDisposed = 0;
  let materialDisposed = 0;
  environment.addEventListener("dispose", () => disposed++);
  mesh.geometry.addEventListener("dispose", () => geometryDisposed++);
  mesh.material.addEventListener("dispose", () => materialDisposed++);
  assert.equal(source.visible, false);
  assert.equal(mesh.castShadow, false);
  card.disconnectedCallback();
  assert.equal(source.visible, true);
  assert.equal(mesh.castShadow, true);
  assert.equal(card._renderer.outputEncoding, THREE.LinearEncoding);
  assert.equal(card._renderer.toneMappingExposure, 0.6);
  assert.equal(card._ambient_light.intensity, 0.5);
  assert.equal(card._torch.intensity, 0.7);
  assert.equal(card._scene.environment, null);
  assert.equal(disposed, 1);
  assert.equal(geometryDisposed + materialDisposed, 0);
  assert.equal(
    card._scene.children.some((object) => object.name.startsWith("f3d_pool_")),
    false,
  );
  card.disconnectedCallback();
  assert.equal(disposed, 1);
});
test("pooled light counts and shadow flags remain fixed across on/off combinations", async () => {
  const { card, source } = make({
    light_pool: { spots: 3, points: 0, shadows: 1 },
  });
  const pooled = card._scene.children.filter((object) =>
    object.name.startsWith("f3d_pool_"),
  );
  assert.equal(pooled.length, 3);
  const flags = pooled.map((object) => object.castShadow);
  source.intensity = 0;
  card._updatelight();
  await Promise.resolve();
  assert.equal(
    pooled.reduce((sum, object) => sum + object.intensity, 0),
    0,
  );
  source.intensity = 2;
  card._updatelight();
  await Promise.resolve();
  assert.equal(
    pooled.reduce((sum, object) => sum + object.intensity, 0),
    2,
  );
  assert.deepEqual(
    pooled.map((object) => object.castShadow),
    flags,
  );
  assert.ok(pooled.every((object) => object.visible));
});
test("point-only models, explicitly disabled shadows, and no-light models work", () => {
  const { card } = make(
    { light_pool: { spots: 0, points: 1, point_shadows: false } },
    { light: false },
  );
  const light = addLight(card, { point: true });
  card._initAmbient();
  assert.equal(light.visible, false);
  const pool = card._scene.children.filter((object) =>
    object.name.startsWith("f3d_pool_"),
  );
  assert.equal(pool.length, 1);
  assert.equal(pool[0].castShadow, false);
});
test("pool does not capture unrelated model lights", () => {
  const { card } = make({ light_pool: true });
  const unrelated = addLight(card, { name: "Unbound" });
  card._initAmbient();
  assert.equal(unrelated.visible, true);
});
test("hidden floor does not keep illuminating the world-space pool", async () => {
  const { card, source } = make({ light_pool: true });
  const floor = new THREE.Group();
  card._scene.add(floor);
  floor.add(source);
  floor.add(source.target);
  floor.visible = false;
  card._requestRender("level");
  await Promise.resolve();
  assert.equal(card._floor3dproAddons.pool.lit, 0);
  floor.visible = true;
  card._requestRender("level");
  await Promise.resolve();
  assert.equal(card._floor3dproAddons.pool.lit, 1);
});
test("light-pool exhaustion is observable and source lights recover on disable", () => {
  const { card } = make({ light_pool: { spots: 1, points: 0 } });
  card._object_ids.push({ objects: [{ object_id: "Distant_Lamp" }] });
  const second = addLight(card, { name: "Distant_Lamp", x: 5000 });
  card._initAmbient();
  assert.equal(card._floor3dproAddons.pool.dropped, 1);
  card.setConfig({ render_upgrade: false });
  assert.equal(second.visible, true);
});
test("off-light culling follows native intensity and restores original visibility", async () => {
  const { card, source } = make({ hide_off_lights: true });
  source.intensity = 0;
  card._updatelight();
  assert.equal(source.visible, false);
  source.intensity = 3;
  card._updatelight();
  assert.equal(source.visible, true);
  card.setConfig({ render_upgrade: false });
  assert.equal(source.visible, true);
  await Promise.resolve();
});
test("reconfiguration recreates pool capacity without accumulating lights", () => {
  const { card } = make({ light_pool: { spots: 2, points: 0 } });
  card.setConfig({
    ...card._config,
    render_upgrade: { light_pool: { spots: 4, points: 0 } },
  });
  assert.equal(
    card._scene.children.filter((object) => object.name.startsWith("f3d_pool_"))
      .length,
    4,
  );
});
test("pending pool work cannot resurrect lights after disconnect or reconfiguration", async () => {
  const { card } = make({ light_pool: true });
  card._updatelight();
  card.disconnectedCallback();
  await Promise.resolve();
  assert.equal(
    card._scene.children.some((object) => object.name.startsWith("f3d_pool_")),
    false,
  );
  card.connectedCallback();
  assert.ok(
    card._scene.children.some((object) => object.name.startsWith("f3d_pool_")),
  );
  card._updatelight();
  card.setConfig({ render_upgrade: false });
  await Promise.resolve();
  assert.equal(
    card._scene.children.some((object) => object.name.startsWith("f3d_pool_")),
    false,
  );
});
test("reconnect re-applies settings without stacking environments or pool lights", () => {
  const { card } = make({ light_pool: { spots: 2, points: 0 } });
  for (let index = 0; index < 3; index++) {
    card.disconnectedCallback();
    card.connectedCallback();
  }
  assert.equal(
    card._scene.children.filter((object) => object.name.startsWith("f3d_pool_"))
      .length,
    2,
  );
  assert.equal(card._renderer.outputEncoding, THREE.sRGBEncoding);
});
test("changed-entity filtering resets when configuration changes", () => {
  const { card } = make({ hass_render: "changed" });
  card._hass = { states: { "light.demo": { state: "on" } } };
  card._requestRender("hass");
  card._requestRender("hass");
  assert.equal(card.renders.filter((reason) => reason === "hass").length, 1);
  card.setConfig({
    ...card._config,
    entities: [{ entity: "light.other", object_id: "Other" }],
  });
  card._hass.states["light.other"] = { state: "off" };
  card._requestRender("hass");
  assert.equal(card.renders.filter((reason) => reason === "hass").length, 2);
});
test("throttle has one trailing render while touch/control renders remain immediate", async () => {
  const { card } = make({ hass_render_ms: 25 });
  card._requestRender("hass");
  card._requestRender("hass");
  card._requestRender("hass");
  card._requestRender("controls");
  assert.equal(card.renders.filter((reason) => reason === "hass").length, 1);
  assert.equal(card.renders.at(-1), "controls");
  await wait(45);
  assert.equal(card.renders.filter((reason) => reason === "hass").length, 2);
});
test("disconnect and configuration replacement cancel trailing timers", async () => {
  for (const action of ["disconnect", "configure"]) {
    const { card } = make({ hass_render_ms: 20 });
    card._requestRender("hass");
    card._requestRender("hass");
    if (action === "disconnect") card.disconnectedCallback();
    else card.setConfig({ render_upgrade: false });
    await wait(35);
    assert.equal(card.renders.filter((reason) => reason === "hass").length, 1);
  }
});
test("pixel ratio applies during renderer setup and original method/value are restored", () => {
  const { card } = make({ pixel_ratio: 0.5 });
  assert.equal(card._renderer.getPixelRatio(), 0.5);
  card._renderer.setPixelRatio(3);
  assert.equal(card._renderer.getPixelRatio(), 0.5);
  card.disconnectedCallback();
  assert.equal(card._renderer.getPixelRatio(), 3);
  card._renderer.setPixelRatio(4);
  assert.equal(card._renderer.getPixelRatio(), 4);
});

test("pixel-ratio rollback remembers the native request made after camera setup", () => {
  const { card } = make({ pixel_ratio: 0.5 });
  card.disconnectedCallback();
  assert.equal(card._renderer.getPixelRatio(), 2);
});
test("multiple cards have independent options, resources and lifecycle", () => {
  const { card: a } = make({
    exposure: 2,
    light_pool: { spots: 1, points: 0 },
  });
  const { card: b } = make({
    exposure: 1,
    light_pool: { spots: 3, points: 0 },
  });
  a.disconnectedCallback();
  assert.equal(b._renderer.toneMappingExposure, 1);
  assert.equal(
    b._scene.children.filter((object) => object.name.startsWith("f3d_pool_"))
      .length,
    3,
  );
});
test("invalid new options do not destroy a working configuration", () => {
  const { card } = make(true);
  const environment = card._scene.environment;
  assert.throws(() => card.setConfig({ render_upgrade: { exposure: -1 } }));
  assert.equal(card._scene.environment, environment);
});
test("unsupported Three renderer leaves native colour settings untouched", () => {
  const { card } = make(false);
  delete card._renderer.outputEncoding;
  card._renderer.outputColorSpace = "srgb";
  card.setConfig({ render_upgrade: true });
  assert.equal(card._renderer.toneMapping, THREE.LinearToneMapping);
  assert.equal(card._scene.environment, null);
});
test("native sky cards are not opted into rendering changes", () => {
  const { card } = make(false);
  card.setConfig({ sky: "yes", render_upgrade: true });
  assert.equal(card._renderer.outputEncoding, THREE.LinearEncoding);
});

test("asynchronous model load after connection recovers from a detached cancellation", () => {
  const Card = cardClass();
  install(Card);
  const card = new Card();
  card.isConnected = false;
  card.setConfig({ render_upgrade: true });
  card._isConnected = false;
  card._cancelScheduledRender();
  card.isConnected = true;
  card.connectedCallback();
  card._onLoaded3DModel();
  assert.equal(card._renderer.outputEncoding, THREE.sRGBEncoding);
});

test("an asynchronous load finishing after removal does not resurrect add-on resources", () => {
  const { card } = make({ light_pool: true });
  card.isConnected = false;
  card.disconnectedCallback();
  card._onLoaded3DModel();
  assert.equal(card._scene.environment, null);
  assert.equal(card._renderer.outputEncoding, THREE.LinearEncoding);
});

test("add-on failure restores native rendering and suppresses retries until reconfigured", () => {
  const { card, source } = make({ light_pool: true });
  safely(card, () => {
    throw new Error("synthetic failure");
  });
  assert.equal(source.visible, true);
  assert.equal(card._renderer.outputEncoding, THREE.LinearEncoding);
  assert.equal(card._floor3dproAddons.rendering, "failed");
  card._updatelight();
  assert.equal(
    card._scene.children.some((object) => object.name.startsWith("f3d_pool_")),
    false,
  );
  card.setConfig({ ...card._config, render_upgrade: true });
  assert.equal(card._renderer.outputEncoding, THREE.sRGBEncoding);
});

test("replacing the scene cleans old owned resources but leaves old model geometry intact", () => {
  const { card, mesh } = make({ light_pool: true });
  const old = card._scene;
  let disposed = false;
  mesh.geometry.addEventListener("dispose", () => {
    disposed = true;
  });
  card._scene = new THREE.Scene();
  card._scene.add(texturedModel().mesh);
  addLight(card);
  card.setConfig({ ...card._config });
  assert.equal(
    old.children.some((object) => object.name.startsWith("f3d_pool_")),
    false,
  );
  assert.equal(old.environment, null);
  assert.equal(disposed, false);
  assert.ok(card._scene.environment);
});
