// SPDX-License-Identifier: MIT
import { fitToCapacity, placeLight } from "./pool.js";
import { VERSION } from "./options.js";

const states = new WeakMap();
const settings = new WeakMap();
const POOL_PREFIX = "f3d_pool_";
const RENDER_FIELDS = ["outputEncoding", "toneMapping", "toneMappingExposure"];

export function configure(card, options) {
  cleanup(card);
  settings.set(card, {
    options,
    generation: 0,
    disconnected: card.isConnected === false,
    watched: new Map(),
    lastRender: -Infinity,
  });
}

function optionsFor(card) {
  const config = settings.get(card);
  return config && !config.disconnected && !config.failed
    ? config.options
    : null;
}

function environmentCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const sky = context.createLinearGradient(0, 0, 0, 256);
  for (const [stop, color] of [
    [0, "#9aa6b5"],
    [0.7, "#cdd3da"],
    [1, "#eceae6"],
  ])
    sky.addColorStop(stop, color);
  context.fillStyle = sky;
  context.fillRect(0, 0, 1024, 256);
  const ground = context.createLinearGradient(0, 256, 0, 512);
  for (const [stop, color] of [
    [0, "#8b8475"],
    [0.25, "#665e50"],
    [1, "#35302a"],
  ])
    ground.addColorStop(stop, color);
  context.fillStyle = ground;
  context.fillRect(0, 256, 1024, 256);
  const sun = context.createRadialGradient(635, 113, 0, 635, 113, 90);
  for (const [stop, color] of [
    [0, "rgba(255,250,236,1)"],
    [0.15, "rgba(255,245,225,0.9)"],
    [1, "rgba(255,240,215,0)"],
  ])
    sun.addColorStop(stop, color);
  context.fillStyle = sun;
  context.fillRect(545, 23, 180, 180);
  return canvas;
}

function findTextureClass(scene) {
  let TextureClass;
  scene.traverse((object) => {
    if (TextureClass || !object.isMesh) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (material?.map?.isTexture) {
        TextureClass = material.map.constructor;
        break;
      }
    }
  });
  return TextureClass;
}

function snapshot(card) {
  let state = states.get(card);
  if (
    state &&
    (state.scene !== card._scene || state.renderer !== card._renderer)
  ) {
    cleanup(card);
    state = null;
  }
  if (!state) {
    state = {
      scene: card._scene,
      renderer: card._renderer,
      rendererValues: Object.fromEntries(
        RENDER_FIELDS.map((key) => [key, card._renderer[key]]),
      ),
      ambient: card._ambient_light,
      ambientIntensity: card._ambient_light?.intensity,
      torch: card._torch,
      torchIntensity: card._torch?.intensity,
      visibility: new Map(),
      castShadows: new Map(),
      pool: null,
    };
    states.set(card, state);
  }
  return state;
}

function warnOnce(card, key, message) {
  const state = settings.get(card);
  if (state && !state[key]) {
    state[key] = true;
    console.warn(`[Floor3D Pro Add-ons] ${message}`);
  }
}

export function applyUpgrade(card) {
  const options = optionsFor(card);
  if (!options || !card._scene || !card._renderer) return;
  // Newer Three releases changed color-management APIs. Do not apply r130 constants there.
  if (
    !("outputEncoding" in card._renderer) ||
    "outputColorSpace" in card._renderer
  ) {
    warnOnce(
      card,
      "incompatibleRenderer",
      "Unsupported Three.js renderer; rendering add-ons skipped. Use the documented Floor3D Pro version.",
    );
    return;
  }
  const state = snapshot(card);
  card._renderer.outputEncoding = 3001;
  card._renderer.toneMapping = 4;
  card._renderer.toneMappingExposure = options.exposure;
  if (card._ambient_light) card._ambient_light.intensity = options.ambient;
  if (card._torch) card._torch.intensity = options.torch;
  if (!card._scene.environment && !state.environment) {
    const TextureClass = findTextureClass(card._scene);
    const canvas = TextureClass && environmentCanvas();
    if (canvas) {
      state.environment = new TextureClass(canvas);
      state.environment.mapping = 303;
      state.environment.encoding = 3001;
      state.environment.needsUpdate = true;
      card._scene.environment = state.environment;
      card._scene.traverse((object) => {
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          if (material) material.needsUpdate = true;
      });
    } else
      warnOnce(
        card,
        "noTexture",
        "No usable texture/canvas; generated environment skipped. Color correction and light pooling remain available.",
      );
  }
  if (!options.cast_shadows)
    card._scene.traverse((object) => {
      if (!object.isMesh) return;
      if (!state.castShadows.has(object))
        state.castShadows.set(object, object.castShadow);
      object.castShadow = false;
    });
  installPixelRatio(card);
  if (options.light_pool) assignPool(card);
  else if (options.hide_off_lights) cullOffLights(card);
  card._floor3dproAddons = {
    version: VERSION,
    rendering: "active",
    pool: state.pool?.stats ?? null,
  };
  card._requestRender?.("render-upgrade");
}

function entityLights(card) {
  const names = new Map();
  (card._object_ids ?? []).forEach((group, entity) => {
    for (const object of group?.objects ?? [])
      names.set(`${object.object_id}_light`, entity);
  });
  const lights = [];
  card._scene?.traverse((object) => {
    if (
      object.isLight &&
      (object.isSpotLight || object.isPointLight) &&
      names.has(object.name) &&
      !object.name.startsWith(POOL_PREFIX)
    ) {
      lights.push({ light: object, entity: names.get(object.name) });
    }
  });
  return lights;
}

function ensurePool(card, state, options, sources) {
  if (state.pool) return state.pool;
  const SpotLight = sources.find(({ light }) => light.isSpotLight)?.light
    .constructor;
  const PointLight = sources.find(({ light }) => light.isPointLight)?.light
    .constructor;
  if (!SpotLight && !PointLight) return null;
  const pool = {
    spots: [],
    points: [],
    shadows: SpotLight ? options.shadows : 0,
    stats: null,
  };
  for (let i = 0; SpotLight && i < options.spots; i += 1) {
    const light = new SpotLight(0xffffff, 0);
    light.name = `${POOL_PREFIX}spot_${i}`;
    light.castShadow = i < pool.shadows;
    light.shadow.bias = -1e-4;
    state.scene.add(light, light.target);
    pool.spots.push(light);
  }
  for (let i = 0; PointLight && i < options.points; i += 1) {
    const light = new PointLight(0xffffff, 0);
    light.name = `${POOL_PREFIX}point_${i}`;
    light.castShadow = options.point_shadows;
    light.shadow.bias = -1e-4;
    state.scene.add(light);
    pool.points.push(light);
  }
  state.pool = pool;
  return pool;
}

function rememberVisibility(state, light) {
  if (!state.visibility.has(light)) state.visibility.set(light, light.visible);
}

export function assignPool(card) {
  const options = optionsFor(card)?.light_pool;
  const state = states.get(card);
  if (!options || !state) return;
  const sources = entityLights(card);
  const pool = ensurePool(card, state, options, sources);
  if (!pool) return;
  const items = [];
  for (const { light, entity } of sources) {
    rememberVisibility(state, light);
    light.visible = false;
    if (
      !(light.intensity > 0) ||
      !Number.isFinite(light.intensity) ||
      !state.visibility.get(light)
    )
      continue;
    const Vector3 = light.position.constructor;
    const position = light.getWorldPosition(new Vector3());
    const item = {
      spot: Boolean(light.isSpotLight),
      position,
      intensity: light.intensity,
      color: light.color.clone(),
      distance: light.distance,
      decay: light.decay,
      shadow: light.castShadow,
      entity,
    };
    if (light.isSpotLight) {
      light.target.updateWorldMatrix(true, false);
      item.direction = light.target
        .getWorldPosition(new Vector3())
        .sub(position)
        .normalize();
      item.angle = Math.max(light.angle, 1e-6);
      item.penumbra = light.penumbra;
    }
    // A hidden floor/fixture must not emit through a pool light in world space.
    let parent = light.parent;
    let visible = true;
    while (parent && parent !== state.scene) {
      if (!parent.visible) visible = false;
      parent = parent.parent;
    }
    if (visible) items.push(item);
  }
  const tally = { merged: 0, dropped: 0 };
  const overflow = [];
  const shadowed = fitToCapacity(
    items.filter((item) => item.spot && item.shadow),
    pool.shadows,
    tally,
    overflow,
  );
  const plain = fitToCapacity(
    [
      ...items.filter((item) => item.spot && !item.shadow),
      ...overflow.map((item) => ({ ...item, shadow: false })),
    ],
    pool.spots.length - shadowed.length,
    tally,
  );
  const points = fitToCapacity(
    items.filter((item) => !item.spot),
    pool.points.length,
    tally,
  );
  const shadowSlots = pool.spots.slice(0, pool.shadows);
  const plainSlots = [
    ...pool.spots.slice(pool.shadows),
    ...shadowSlots.slice(shadowed.length),
  ];
  shadowSlots
    .slice(0, shadowed.length)
    .forEach((light, index) => placeLight(light, shadowed[index]));
  plainSlots.forEach((light, index) => placeLight(light, plain[index]));
  pool.points.forEach((light, index) => placeLight(light, points[index]));
  pool.stats = {
    lit: items.length,
    shadowed: shadowed.length,
    spots: shadowed.length + plain.length,
    points: points.length,
    ...tally,
  };
  if (card._floor3dproAddons) card._floor3dproAddons.pool = { ...pool.stats };
  if (tally.dropped !== (state.lastDropped ?? 0) && tally.dropped > 0)
    console.warn(
      `[Floor3D Pro Add-ons] Light pool capacity exceeded: ${tally.dropped} light(s) omitted. Increase the pool size or disable light_pool.`,
    );
  state.lastDropped = tally.dropped;
  if (state.renderer.shadowMap) state.renderer.shadowMap.needsUpdate = true;
  card._requestRender?.("light-pool");
}

export function updateLights(card) {
  const config = settings.get(card);
  const options = optionsFor(card);
  if (!options || !states.has(card)) return;
  if (!options.light_pool) {
    if (options.hide_off_lights) cullOffLights(card);
    return;
  }
  if (config.poolQueued) return;
  config.poolQueued = true;
  const generation = config.generation;
  queueMicrotask(() => {
    if (
      settings.get(card) !== config ||
      config.generation !== generation ||
      config.disconnected ||
      config.failed
    )
      return;
    config.poolQueued = false;
    safely(card, () => assignPool(card));
  });
}

function cullOffLights(card) {
  const state = states.get(card);
  if (!state) return;
  for (const { light } of entityLights(card)) {
    rememberVisibility(state, light);
    light.visible = state.visibility.get(light) && light.intensity > 0;
  }
}

export function installPixelRatio(card) {
  const options = optionsFor(card);
  const renderer = card._renderer;
  if (
    options?.pixel_ratio == null ||
    !renderer ||
    typeof renderer.setPixelRatio !== "function" ||
    !("outputEncoding" in renderer) ||
    "outputColorSpace" in renderer
  )
    return;
  const config = settings.get(card);
  if (config.pixelRenderer === renderer) return;
  if (config.pixelRenderer) restorePixelRatio(config);
  config.pixelRenderer = renderer;
  config.pixelMethod = renderer.setPixelRatio;
  config.pixelHadOwn = Object.hasOwn(renderer, "setPixelRatio");
  config.pixelValue = renderer.getPixelRatio?.();
  renderer.setPixelRatio = function (value) {
    // Remember the native card's requested ratio for rollback, while applying
    // the configured low-power ratio now. Do not capture our own override.
    if (Number.isFinite(value) && value > 0) config.pixelValue = value;
    return config.pixelMethod.call(this, options.pixel_ratio);
  };
  config.pixelMethod.call(renderer, options.pixel_ratio);
}

function restorePixelRatio(config) {
  const renderer = config.pixelRenderer;
  if (!renderer) return;
  if (config.pixelHadOwn) renderer.setPixelRatio = config.pixelMethod;
  else delete renderer.setPixelRatio;
  if (Number.isFinite(config.pixelValue))
    config.pixelMethod.call(renderer, config.pixelValue);
  config.pixelRenderer = null;
}

export function requestRender(card, original, args) {
  const options = optionsFor(card);
  const config = settings.get(card);
  if (!options || args[0] !== "hass") return original.apply(card, args);
  if (options.hass_render === "changed") {
    const ids = [
      ...new Set(
        (card._config?.entities ?? [])
          .map((entity) => entity.entity)
          .filter(Boolean),
      ),
    ];
    let changed = config.watched.size === 0;
    for (const id of ids) {
      const next = card._hass?.states?.[id];
      if (!config.watched.has(id) || config.watched.get(id) !== next)
        changed = true;
      config.watched.set(id, next);
    }
    if (!changed) return undefined;
  }
  const delay =
    options.hass_render_ms - (performance.now() - config.lastRender);
  if (delay <= 0) {
    if (config.timer !== undefined) clearTimeout(config.timer);
    config.timer = undefined;
    config.lastRender = performance.now();
    return original.apply(card, args);
  }
  if (config.timer === undefined) {
    const generation = config.generation;
    config.timer = setTimeout(() => {
      config.timer = undefined;
      if (
        settings.get(card) !== config ||
        config.generation !== generation ||
        config.disconnected ||
        config.failed
      )
        return;
      config.lastRender = performance.now();
      original.apply(card, args);
    }, delay);
  }
  return undefined;
}

export function cleanup(card) {
  const config = settings.get(card);
  if (config) {
    config.generation += 1;
    config.poolQueued = false;
    if (config.timer !== undefined) clearTimeout(config.timer);
    config.timer = undefined;
    config.watched.clear();
    config.lastRender = -Infinity;
    restorePixelRatio(config);
  }
  const state = states.get(card);
  if (!state) return;
  for (const light of [
    ...(state.pool?.spots ?? []),
    ...(state.pool?.points ?? []),
  ]) {
    state.scene.remove(light);
    if (light.target) state.scene.remove(light.target);
    // Only GPU targets created by our own shadow lights belong to this module.
    light.shadow?.map?.dispose();
    light.shadow?.mapPass?.dispose();
  }
  for (const [light, visible] of state.visibility) light.visible = visible;
  for (const [mesh, castShadow] of state.castShadows)
    mesh.castShadow = castShadow;
  if (state.environment) {
    if (state.scene.environment === state.environment)
      state.scene.environment = null;
    state.environment.dispose();
  }
  Object.assign(state.renderer, state.rendererValues);
  if (state.ambient) state.ambient.intensity = state.ambientIntensity;
  if (state.torch) state.torch.intensity = state.torchIntensity;
  if (state.renderer.shadowMap) state.renderer.shadowMap.needsUpdate = true;
  states.delete(card);
  card._floor3dproAddons = {
    version: VERSION,
    rendering: "inactive",
    pool: null,
  };
}

export function disconnect(card) {
  cleanup(card);
  const config = settings.get(card);
  if (config) config.disconnected = true;
}

export function reconnect(card) {
  const config = settings.get(card);
  if (config) config.disconnected = false;
  if (card._modelready) applyUpgrade(card);
}

export function safely(card, operation) {
  try {
    return operation();
  } catch (error) {
    cleanup(card);
    const config = settings.get(card);
    if (config) config.failed = true;
    card._floor3dproAddons = {
      version: VERSION,
      rendering: "failed",
      pool: null,
    };
    // Do not dump card/config/model objects or error messages containing household names.
    console.warn(
      "[Floor3D Pro Add-ons] Rendering add-on failed; native rendering restored. Reconfigure or reload to retry.",
    );
    void error;
    return undefined;
  }
}
