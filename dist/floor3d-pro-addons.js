/*! Floor3D Pro Add-ons v0.1.0 | MIT | EndOfTheLine-HA | See LICENSE and NOTICE */
(() => {
  // src/options.js
  var VERSION = "0.1.0";
  var CARD_TAG = "floor3dpro-card";
  var SUPPORTED_CARD_VERSION = "1.5.3-Pro.Faz.2.1";
  var DEFAULTS = {
    exposure: 1.6,
    ambient: 0.1,
    torch: 0.3,
    hide_off_lights: false,
    light_pool: false,
    hass_render: "all",
    hass_render_ms: 0,
    pixel_ratio: null,
    cast_shadows: true
  };
  var POOL_DEFAULTS = { spots: 14, points: 2, shadows: 6, point_shadows: true };
  function record(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`[Floor3D Pro Add-ons] ${label} must be an object.`);
    }
    return value;
  }
  function knownKeys(value, allowed, label) {
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(allowed, key)) {
        throw new Error(
          `[Floor3D Pro Add-ons] Unsupported ${label} option: ${key}. See docs/configuration.md.`
        );
      }
    }
  }
  function number(value, min, max, label, integer = false) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) {
      throw new Error(
        `[Floor3D Pro Add-ons] ${label} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}.`
      );
    }
  }
  function boolean(value, label) {
    if (typeof value !== "boolean") {
      throw new Error(
        `[Floor3D Pro Add-ons] ${label} must be true or false (not a quoted string).`
      );
    }
  }
  function parseOptions(config = {}) {
    const value = config.render_upgrade;
    if (value === void 0 || value === null || value === false || value === "no")
      return null;
    const raw = value === true || value === "yes" ? {} : record(value, "render_upgrade");
    knownKeys(raw, DEFAULTS, "render_upgrade");
    const options = { ...DEFAULTS, ...raw };
    for (const key of ["exposure", "ambient", "torch"])
      number(options[key], 0, 10, key);
    for (const key of ["hide_off_lights", "cast_shadows"])
      boolean(options[key], key);
    number(options.hass_render_ms, 0, 6e4, "hass_render_ms", true);
    if (!["all", "changed"].includes(options.hass_render))
      throw new Error(
        "[Floor3D Pro Add-ons] hass_render must be all or changed."
      );
    if (options.pixel_ratio !== null)
      number(options.pixel_ratio, 0.25, 4, "pixel_ratio");
    if (options.light_pool !== false) {
      const poolValue = options.light_pool === true ? {} : record(options.light_pool, "light_pool");
      knownKeys(poolValue, POOL_DEFAULTS, "light_pool");
      const pool = { ...POOL_DEFAULTS, ...poolValue };
      number(pool.spots, 0, 64, "light_pool.spots", true);
      number(pool.points, 0, 16, "light_pool.points", true);
      number(pool.shadows, 0, 64, "light_pool.shadows", true);
      boolean(pool.point_shadows, "light_pool.point_shadows");
      if (pool.spots + pool.points === 0)
        throw new Error(
          "[Floor3D Pro Add-ons] light_pool must have at least one slot."
        );
      pool.shadows = Math.min(pool.shadows, pool.spots);
      options.light_pool = Object.freeze(pool);
    }
    if (config.sky === "yes" || config.sky === true) return null;
    return Object.freeze(options);
  }
  function hierarchyEnabled(config = {}) {
    const value = config.glb_hierarchy_fix;
    if (value === void 0) return true;
    boolean(value, "glb_hierarchy_fix");
    return value;
  }

  // src/glb-hierarchy.js
  function isGlbCard(card) {
    const file = String(card?._config?.objfile ?? "").split(/[?#]/)[0].toLowerCase();
    return file.endsWith(".glb") && hierarchyEnabled(card._config);
  }
  function captureHierarchy(model) {
    const groups = [];
    model?.traverse((object) => {
      if (object.type !== "Group" || !object.name) return;
      const primitives = object.children.filter(
        (child) => child.isMesh && child.geometry
      );
      if (primitives.length > 1) groups.push({ group: object, primitives });
    });
    return groups;
  }
  function restoreHierarchy(card, groups) {
    let attachedMeshes = 0;
    let reconciledGroups = 0;
    const levels = new Set((card._levels ?? []).filter(Boolean));
    for (const { group, primitives } of groups) {
      if (!levels.has(group.parent)) continue;
      const level = group.parent;
      const eligible = primitives.filter(
        (primitive) => primitive.parent === level
      );
      if (eligible.length < 2) continue;
      for (const primitive of eligible) group.add(primitive);
      group.updateWorldMatrix(true, true);
      attachedMeshes += eligible.length;
      reconciledGroups += 1;
    }
    card._floor3dproGlbHierarchyFix = { attachedMeshes, reconciledGroups };
  }
  function configured(card, name) {
    return (card._object_ids ?? []).some(
      (group) => (group?.objects ?? []).some((object) => object?.object_id === name)
    );
  }
  function findLightAncestor(card, object) {
    let ancestor = object?.parent;
    while (ancestor) {
      for (let index = 0; index < (card._config?.entities ?? []).length; index += 1) {
        if (card._config.entities[index]?.type3d !== "light") continue;
        if ((card._object_ids?.[index]?.objects ?? []).some(
          (entry) => entry.object_id === ancestor.name
        ))
          return ancestor;
      }
      ancestor = ancestor.parent;
    }
    return null;
  }
  function fireWithHierarchy(card, original, event) {
    if (!isGlbCard(card) || card._selectionModeEnabled)
      return original.call(card, event);
    const intersections = card._getintersect(event);
    const hit = intersections?.[0]?.object;
    const ancestor = hit?.name && !configured(card, hit.name) ? findLightAncestor(card, hit) : null;
    const resolved = ancestor ? [{ ...intersections[0], object: ancestor }, ...intersections.slice(1)] : intersections;
    const hadOwn = Object.hasOwn(card, "_getintersect");
    const previous = card._getintersect;
    card._getintersect = () => resolved;
    try {
      return original.call(card, event);
    } finally {
      if (hadOwn) card._getintersect = previous;
      else delete card._getintersect;
    }
  }

  // src/pool.js
  var SAME_ENTITY_EXTENT_CM = 900;
  var CROSS_EXTENT_CM = 450;
  var CROSS_COST_FACTOR = 4;
  var MIN_AIM_DOT = 0.9;
  var MERGE_THROW_CM = 250;
  var MAX_CONE_SHADOW = 70 * Math.PI / 180;
  var MAX_CONE_PLAIN = 85 * Math.PI / 180;
  function membersOf(item) {
    return item.members ?? [item];
  }
  function fluxOf(item) {
    return item.spot ? item.intensity * (1 - Math.cos(item.angle)) : item.intensity;
  }
  function mergeCost(a, b) {
    if (a.spot !== b.spot || a.shadow !== b.shadow) {
      return null;
    }
    const sameEntity = a.entity != null && a.entity === b.entity;
    if (!sameEntity && a.shadow && !(a.mergeTag && a.mergeTag === b.mergeTag)) {
      return null;
    }
    if (a.spot && a.direction.dot(b.direction) < MIN_AIM_DOT) {
      return null;
    }
    const limit = sameEntity ? SAME_ENTITY_EXTENT_CM : CROSS_EXTENT_CM;
    for (const m of membersOf(a)) {
      for (const n of membersOf(b)) {
        if (m.position.distanceTo(n.position) > limit) {
          return null;
        }
      }
    }
    const fa = fluxOf(a);
    const fb = fluxOf(b);
    const cost = fa * fb / (fa + fb) * a.position.distanceToSquared(b.position);
    return sameEntity ? cost : cost * CROSS_COST_FACTOR;
  }
  function mergeItems(a, b) {
    const members = [...membersOf(a), ...membersOf(b)];
    const weights = members.map(fluxOf);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const position = a.position.clone().multiplyScalar(0);
    const color = a.color.clone().multiplyScalar(0);
    let decay = 0;
    members.forEach((member, i) => {
      const share = weights[i] / total;
      position.add(member.position.clone().multiplyScalar(share));
      color.add(member.color.clone().multiplyScalar(share));
      decay += member.decay * share;
    });
    const merged = {
      ...a,
      members,
      position,
      color,
      decay,
      entity: a.entity === b.entity ? a.entity : null,
      distance: Math.max(
        ...members.map(
          (member) => member.position.distanceTo(position) + member.distance
        )
      )
    };
    if (!a.spot) {
      merged.intensity = total;
      return merged;
    }
    const direction = a.direction.clone().multiplyScalar(0);
    members.forEach(
      (member, i) => direction.add(member.direction.clone().multiplyScalar(weights[i]))
    );
    direction.normalize();
    let angle = 0;
    for (const member of members) {
      const offset = member.position.clone().sub(position);
      const along = offset.dot(direction);
      const across = Math.sqrt(Math.max(offset.lengthSq() - along * along, 0));
      angle = Math.max(
        angle,
        Math.atan2(
          across + MERGE_THROW_CM * Math.tan(member.angle),
          MERGE_THROW_CM
        )
      );
    }
    merged.direction = direction;
    merged.angle = Math.min(angle, a.shadow ? MAX_CONE_SHADOW : MAX_CONE_PLAIN);
    merged.penumbra = Math.max(...members.map((member) => member.penumbra));
    merged.intensity = total / (1 - Math.cos(merged.angle));
    return merged;
  }
  function fitToCapacity(items, capacity, tally, overflow = null) {
    const list = items.slice();
    while (list.length > Math.max(capacity, 0)) {
      let best = null;
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const cost = mergeCost(list[i], list[j]);
          if (cost !== null && (!best || cost < best.cost)) {
            best = { i, j, cost };
          }
        }
      }
      if (best) {
        list[best.i] = mergeItems(list[best.i], list[best.j]);
        list.splice(best.j, 1);
        tally.merged += 1;
        continue;
      }
      let weakest = 0;
      list.forEach((item, i) => {
        if (item.intensity * item.distance < list[weakest].intensity * list[weakest].distance) {
          weakest = i;
        }
      });
      const [removed] = list.splice(weakest, 1);
      if (overflow) {
        overflow.push(removed);
      } else {
        tally.dropped += 1;
      }
    }
    return list;
  }
  function placeLight(light, item) {
    if (!item) {
      light.intensity = 0;
      return;
    }
    light.position.copy(item.position);
    light.color.copy(item.color);
    light.intensity = item.intensity;
    light.distance = item.distance;
    light.decay = item.decay;
    if (light.isSpotLight) {
      light.angle = item.angle;
      light.penumbra = item.penumbra;
      light.target.position.copy(item.position).add(item.direction.clone().multiplyScalar(100));
      light.target.updateMatrixWorld();
    }
  }

  // src/render-upgrade.js
  var states = /* @__PURE__ */ new WeakMap();
  var settings = /* @__PURE__ */ new WeakMap();
  var POOL_PREFIX = "f3d_pool_";
  var RENDER_FIELDS = ["outputEncoding", "toneMapping", "toneMappingExposure"];
  function configure(card, options) {
    cleanup(card);
    settings.set(card, {
      options,
      generation: 0,
      disconnected: card.isConnected === false,
      watched: /* @__PURE__ */ new Map(),
      lastRender: -Infinity
    });
  }
  function optionsFor(card) {
    const config = settings.get(card);
    return config && !config.disconnected && !config.failed ? config.options : null;
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
      [1, "#eceae6"]
    ])
      sky.addColorStop(stop, color);
    context.fillStyle = sky;
    context.fillRect(0, 0, 1024, 256);
    const ground = context.createLinearGradient(0, 256, 0, 512);
    for (const [stop, color] of [
      [0, "#8b8475"],
      [0.25, "#665e50"],
      [1, "#35302a"]
    ])
      ground.addColorStop(stop, color);
    context.fillStyle = ground;
    context.fillRect(0, 256, 1024, 256);
    const sun = context.createRadialGradient(635, 113, 0, 635, 113, 90);
    for (const [stop, color] of [
      [0, "rgba(255,250,236,1)"],
      [0.15, "rgba(255,245,225,0.9)"],
      [1, "rgba(255,240,215,0)"]
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
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
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
    if (state && (state.scene !== card._scene || state.renderer !== card._renderer)) {
      cleanup(card);
      state = null;
    }
    if (!state) {
      state = {
        scene: card._scene,
        renderer: card._renderer,
        rendererValues: Object.fromEntries(
          RENDER_FIELDS.map((key) => [key, card._renderer[key]])
        ),
        ambient: card._ambient_light,
        ambientIntensity: card._ambient_light?.intensity,
        torch: card._torch,
        torchIntensity: card._torch?.intensity,
        visibility: /* @__PURE__ */ new Map(),
        castShadows: /* @__PURE__ */ new Map(),
        pool: null
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
  function applyUpgrade(card) {
    const options = optionsFor(card);
    if (!options || !card._scene || !card._renderer) return;
    if (!("outputEncoding" in card._renderer) || "outputColorSpace" in card._renderer) {
      warnOnce(
        card,
        "incompatibleRenderer",
        "Unsupported Three.js renderer; rendering add-ons skipped. Use the documented Floor3D Pro version."
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
          for (const material of Array.isArray(object.material) ? object.material : [object.material])
            if (material) material.needsUpdate = true;
        });
      } else
        warnOnce(
          card,
          "noTexture",
          "No usable texture/canvas; generated environment skipped. Color correction and light pooling remain available."
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
      pool: state.pool?.stats ?? null
    };
    card._requestRender?.("render-upgrade");
  }
  function entityLights(card) {
    const names = /* @__PURE__ */ new Map();
    (card._object_ids ?? []).forEach((group, entity) => {
      for (const object of group?.objects ?? [])
        names.set(`${object.object_id}_light`, entity);
    });
    const lights = [];
    card._scene?.traverse((object) => {
      if (object.isLight && (object.isSpotLight || object.isPointLight) && names.has(object.name) && !object.name.startsWith(POOL_PREFIX)) {
        lights.push({ light: object, entity: names.get(object.name) });
      }
    });
    return lights;
  }
  function ensurePool(card, state, options, sources) {
    if (state.pool) return state.pool;
    const SpotLight = sources.find(({ light }) => light.isSpotLight)?.light.constructor;
    const PointLight = sources.find(({ light }) => light.isPointLight)?.light.constructor;
    if (!SpotLight && !PointLight) return null;
    const pool = {
      spots: [],
      points: [],
      shadows: SpotLight ? options.shadows : 0,
      stats: null
    };
    for (let i = 0; SpotLight && i < options.spots; i += 1) {
      const light = new SpotLight(16777215, 0);
      light.name = `${POOL_PREFIX}spot_${i}`;
      light.castShadow = i < pool.shadows;
      light.shadow.bias = -1e-4;
      state.scene.add(light, light.target);
      pool.spots.push(light);
    }
    for (let i = 0; PointLight && i < options.points; i += 1) {
      const light = new PointLight(16777215, 0);
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
  function assignPool(card) {
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
      if (!(light.intensity > 0) || !Number.isFinite(light.intensity) || !state.visibility.get(light))
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
        entity
      };
      if (light.isSpotLight) {
        light.target.updateWorldMatrix(true, false);
        item.direction = light.target.getWorldPosition(new Vector3()).sub(position).normalize();
        item.angle = Math.max(light.angle, 1e-6);
        item.penumbra = light.penumbra;
      }
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
      overflow
    );
    const plain = fitToCapacity(
      [
        ...items.filter((item) => item.spot && !item.shadow),
        ...overflow.map((item) => ({ ...item, shadow: false }))
      ],
      pool.spots.length - shadowed.length,
      tally
    );
    const points = fitToCapacity(
      items.filter((item) => !item.spot),
      pool.points.length,
      tally
    );
    const shadowSlots = pool.spots.slice(0, pool.shadows);
    const plainSlots = [
      ...pool.spots.slice(pool.shadows),
      ...shadowSlots.slice(shadowed.length)
    ];
    shadowSlots.slice(0, shadowed.length).forEach((light, index) => placeLight(light, shadowed[index]));
    plainSlots.forEach((light, index) => placeLight(light, plain[index]));
    pool.points.forEach((light, index) => placeLight(light, points[index]));
    pool.stats = {
      lit: items.length,
      shadowed: shadowed.length,
      spots: shadowed.length + plain.length,
      points: points.length,
      ...tally
    };
    if (card._floor3dproAddons) card._floor3dproAddons.pool = { ...pool.stats };
    if (tally.dropped !== (state.lastDropped ?? 0) && tally.dropped > 0)
      console.warn(
        `[Floor3D Pro Add-ons] Light pool capacity exceeded: ${tally.dropped} light(s) omitted. Increase the pool size or disable light_pool.`
      );
    state.lastDropped = tally.dropped;
    if (state.renderer.shadowMap) state.renderer.shadowMap.needsUpdate = true;
    card._requestRender?.("light-pool");
  }
  function updateLights(card) {
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
      if (settings.get(card) !== config || config.generation !== generation || config.disconnected || config.failed)
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
  function installPixelRatio(card) {
    const options = optionsFor(card);
    const renderer = card._renderer;
    if (options?.pixel_ratio == null || !renderer || typeof renderer.setPixelRatio !== "function" || !("outputEncoding" in renderer) || "outputColorSpace" in renderer)
      return;
    const config = settings.get(card);
    if (config.pixelRenderer === renderer) return;
    if (config.pixelRenderer) restorePixelRatio(config);
    config.pixelRenderer = renderer;
    config.pixelMethod = renderer.setPixelRatio;
    config.pixelHadOwn = Object.hasOwn(renderer, "setPixelRatio");
    config.pixelValue = renderer.getPixelRatio?.();
    renderer.setPixelRatio = function(value) {
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
  function requestRender(card, original, args) {
    const options = optionsFor(card);
    const config = settings.get(card);
    if (!options || args[0] !== "hass") return original.apply(card, args);
    if (options.hass_render === "changed") {
      const ids = [
        ...new Set(
          (card._config?.entities ?? []).map((entity) => entity.entity).filter(Boolean)
        )
      ];
      let changed = config.watched.size === 0;
      for (const id of ids) {
        const next = card._hass?.states?.[id];
        if (!config.watched.has(id) || config.watched.get(id) !== next)
          changed = true;
        config.watched.set(id, next);
      }
      if (!changed) return void 0;
    }
    const delay = options.hass_render_ms - (performance.now() - config.lastRender);
    if (delay <= 0) {
      if (config.timer !== void 0) clearTimeout(config.timer);
      config.timer = void 0;
      config.lastRender = performance.now();
      return original.apply(card, args);
    }
    if (config.timer === void 0) {
      const generation = config.generation;
      config.timer = setTimeout(() => {
        config.timer = void 0;
        if (settings.get(card) !== config || config.generation !== generation || config.disconnected || config.failed)
          return;
        config.lastRender = performance.now();
        original.apply(card, args);
      }, delay);
    }
    return void 0;
  }
  function cleanup(card) {
    const config = settings.get(card);
    if (config) {
      config.generation += 1;
      config.poolQueued = false;
      if (config.timer !== void 0) clearTimeout(config.timer);
      config.timer = void 0;
      config.watched.clear();
      config.lastRender = -Infinity;
      restorePixelRatio(config);
    }
    const state = states.get(card);
    if (!state) return;
    for (const light of [
      ...state.pool?.spots ?? [],
      ...state.pool?.points ?? []
    ]) {
      state.scene.remove(light);
      if (light.target) state.scene.remove(light.target);
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
      pool: null
    };
  }
  function disconnect(card) {
    cleanup(card);
    const config = settings.get(card);
    if (config) config.disconnected = true;
  }
  function reconnect(card) {
    const config = settings.get(card);
    if (config) config.disconnected = false;
    if (card._modelready) applyUpgrade(card);
  }
  function safely(card, operation) {
    try {
      return operation();
    } catch (error) {
      cleanup(card);
      const config = settings.get(card);
      if (config) config.failed = true;
      card._floor3dproAddons = {
        version: VERSION,
        rendering: "failed",
        pool: null
      };
      console.warn(
        "[Floor3D Pro Add-ons] Rendering add-on failed; native rendering restored. Reconfigure or reload to retry."
      );
      void error;
      return void 0;
    }
  }

  // src/install.js
  var PATCH_FLAG = /* @__PURE__ */ Symbol.for("floor3dpro.addons.installed");
  var ADOPT = /* @__PURE__ */ Symbol.for("floor3dpro.addons.adoptExisting");
  var LEGACY_FLAGS = [
    /* @__PURE__ */ Symbol.for("floor3dpro.renderUpgrade.installed"),
    /* @__PURE__ */ Symbol.for("floor3dpro.glbHierarchyFix.installed")
  ];
  var REQUIRED = [
    "setConfig",
    "_initobjects",
    "_firEvent",
    "_getintersect",
    "_initAmbient",
    "_onLoaded3DModel",
    "_updatelight",
    "_requestRender",
    "_cancelScheduledRender",
    "_setCamera",
    "connectedCallback",
    "disconnectedCallback"
  ];
  function install(CardClass) {
    const prototype = CardClass?.prototype;
    if (!prototype)
      return { status: "unsupported", reason: "Card class is not available." };
    if (Object.hasOwn(prototype, PATCH_FLAG))
      return {
        status: "installed",
        version: prototype[PATCH_FLAG],
        alreadyInstalled: true
      };
    if (LEGACY_FLAGS.some((flag) => prototype[flag])) {
      console.warn(
        "[Floor3D Pro Add-ons] Legacy add-on resources are already loaded. Remove both legacy resources and reload; no additional patches installed."
      );
      return {
        status: "legacy_conflict",
        reason: "Remove legacy add-on resources and reload."
      };
    }
    const missing = REQUIRED.filter(
      (name) => typeof prototype[name] !== "function"
    );
    if (missing.length) {
      console.warn(
        `[Floor3D Pro Add-ons] Unsupported card contract (${missing.join(", ")}); no patches installed.`
      );
      return {
        status: "unsupported",
        reason: `Missing card methods: ${missing.join(", ")}`
      };
    }
    const patchedMethods = REQUIRED.filter(
      (name) => !["connectedCallback", "disconnectedCallback", "_getintersect"].includes(
        name
      )
    );
    const blocked = patchedMethods.some((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      return descriptor && (!Object.hasOwn(descriptor, "value") || !descriptor.writable);
    });
    if (blocked || !Object.isExtensible(prototype)) {
      console.warn(
        "[Floor3D Pro Add-ons] Card prototype cannot be patched safely; no patches installed."
      );
      return {
        status: "unsupported",
        reason: "Card prototype is not writable/extensible."
      };
    }
    const original = Object.fromEntries(
      REQUIRED.map((name) => [name, prototype[name]])
    );
    const configured2 = /* @__PURE__ */ new WeakSet();
    const warnedLate = /* @__PURE__ */ new WeakSet();
    const warnLate = (card, message) => {
      if (warnedLate.has(card)) return;
      warnedLate.add(card);
      console.warn(`[Floor3D Pro Add-ons] ${message}`);
    };
    const adopt = (card) => {
      if (configured2.has(card)) return true;
      const config = card?._config;
      if (!config || typeof config !== "object") {
        warnLate(
          card,
          "Card was configured before this resource loaded. Reload the dashboard to activate its rendering add-ons."
        );
        return false;
      }
      let options;
      try {
        options = parseOptions(config);
        hierarchyEnabled(config);
      } catch {
        warnLate(
          card,
          "Card was configured before this resource loaded and its add-on options are invalid; native rendering kept. Fix the options and reload."
        );
        return false;
      }
      configure(card, options);
      configured2.add(card);
      return true;
    };
    const active = (card) => configured2.has(card) || adopt(card);
    const adoptExisting = (card) => {
      if (configured2.has(card)) return;
      const modelLoaded = card?._modelready === true;
      if (!adopt(card)) return;
      if (modelLoaded && isGlbCard(card))
        warnLate(
          card,
          "Card loaded its model before this resource loaded; rendering add-ons are active, and GLB hierarchy repair applies after the next reload."
        );
      if (modelLoaded && card.isConnected !== false)
        safely(card, () => {
          installPixelRatio(card);
          applyUpgrade(card);
        });
    };
    prototype.setConfig = function(config) {
      const options = parseOptions(config);
      hierarchyEnabled(config);
      configure(this, options);
      const result = original.setConfig.call(this, config);
      configured2.add(this);
      if (this._modelready && this.isConnected !== false)
        safely(this, () => applyUpgrade(this));
      return result;
    };
    prototype._initobjects = function(model) {
      const groups = isGlbCard(this) ? captureHierarchy(model) : null;
      const result = original._initobjects.call(this, model);
      if (groups) {
        try {
          restoreHierarchy(this, groups);
        } catch {
          console.warn(
            "[Floor3D Pro Add-ons] GLB hierarchy repair failed; reload with glb_hierarchy_fix: false to use native behavior."
          );
        }
      }
      return result;
    };
    prototype._firEvent = function(event) {
      return fireWithHierarchy(this, original._firEvent, event);
    };
    prototype._initAmbient = function(...args) {
      cleanup(this);
      const result = original._initAmbient.apply(this, args);
      if (active(this)) safely(this, () => applyUpgrade(this));
      return result;
    };
    prototype._onLoaded3DModel = function(...args) {
      cleanup(this);
      const result = original._onLoaded3DModel.apply(this, args);
      if (active(this))
        safely(this, () => {
          if (this.isConnected === true || this._isConnected === true)
            reconnect(this);
          else applyUpgrade(this);
        });
      return result;
    };
    prototype._updatelight = function(...args) {
      const result = original._updatelight.apply(this, args);
      if (configured2.has(this)) safely(this, () => updateLights(this));
      return result;
    };
    prototype._requestRender = function(...args) {
      if (args[0] === "connected" && configured2.has(this))
        safely(this, () => reconnect(this));
      if (args[0] === "level" && configured2.has(this))
        safely(this, () => updateLights(this));
      return requestRender(this, original._requestRender, args);
    };
    prototype._setCamera = function(...args) {
      const result = original._setCamera.apply(this, args);
      if (configured2.has(this)) safely(this, () => installPixelRatio(this));
      return result;
    };
    prototype._cancelScheduledRender = function(...args) {
      if (this._isConnected === false || this.isConnected === false)
        disconnect(this);
      return original._cancelScheduledRender.apply(this, args);
    };
    Object.defineProperty(prototype, PATCH_FLAG, { value: VERSION });
    Object.defineProperty(prototype, ADOPT, { value: adoptExisting });
    for (const flag of LEGACY_FLAGS)
      Object.defineProperty(prototype, flag, { value: true });
    return { status: "installed", version: VERSION };
  }

  // src/index.js
  function existingCards(root = globalThis.document) {
    const found = [];
    if (!root?.querySelectorAll) return found;
    const queue = [root];
    while (queue.length) {
      const node = queue.shift();
      for (const element of node.querySelectorAll("*")) {
        if (element.localName === CARD_TAG) found.push(element);
        if (element.shadowRoot) queue.push(element.shadowRoot);
      }
    }
    return found;
  }
  var status = {
    version: VERSION,
    supportedCardVersion: SUPPORTED_CARD_VERSION,
    status: "waiting_for_card"
  };
  globalThis.floor3dProAddons = status;
  if (typeof customElements !== "undefined") {
    const activate = () => {
      try {
        const CardClass = customElements.get(CARD_TAG);
        Object.assign(status, install(CardClass));
        const adopt = CardClass?.prototype?.[ADOPT];
        if (status.status === "installed" && typeof adopt === "function")
          for (const card of existingCards()) adopt.call(null, card);
      } catch {
        status.status = "failed";
        console.warn(
          "[Floor3D Pro Add-ons] Installation failed. Remove this resource and reload to return to native behavior."
        );
      }
    };
    if (customElements.get(CARD_TAG)) activate();
    else customElements.whenDefined(CARD_TAG).then(activate);
  }
})();
