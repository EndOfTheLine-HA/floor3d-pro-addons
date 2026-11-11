// SPDX-License-Identifier: MIT
import {
  captureHierarchy,
  restoreHierarchy,
  isGlbCard,
  fireWithHierarchy,
} from "./glb-hierarchy.js";
import { parseOptions, hierarchyEnabled, VERSION } from "./options.js";
import {
  configure,
  cleanup,
  applyUpgrade,
  updateLights,
  installPixelRatio,
  requestRender,
  disconnect,
  reconnect,
  safely,
} from "./render-upgrade.js";

const PATCH_FLAG = Symbol.for("floor3dpro.addons.installed");
const LEGACY_FLAGS = [
  Symbol.for("floor3dpro.renderUpgrade.installed"),
  Symbol.for("floor3dpro.glbHierarchyFix.installed"),
];
const REQUIRED = [
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
  "disconnectedCallback",
];

export function install(CardClass) {
  const prototype = CardClass?.prototype;
  if (!prototype)
    return { status: "unsupported", reason: "Card class is not available." };
  if (Object.hasOwn(prototype, PATCH_FLAG))
    return {
      status: "installed",
      version: prototype[PATCH_FLAG],
      alreadyInstalled: true,
    };
  if (LEGACY_FLAGS.some((flag) => prototype[flag])) {
    console.warn(
      "[Floor3D Pro Add-ons] Legacy add-on resources are already loaded. Remove both legacy resources and reload; no additional patches installed.",
    );
    return {
      status: "legacy_conflict",
      reason: "Remove legacy add-on resources and reload.",
    };
  }
  const missing = REQUIRED.filter(
    (name) => typeof prototype[name] !== "function",
  );
  if (missing.length) {
    console.warn(
      `[Floor3D Pro Add-ons] Unsupported card contract (${missing.join(", ")}); no patches installed.`,
    );
    return {
      status: "unsupported",
      reason: `Missing card methods: ${missing.join(", ")}`,
    };
  }
  const patchedMethods = REQUIRED.filter(
    (name) =>
      !["connectedCallback", "disconnectedCallback", "_getintersect"].includes(
        name,
      ),
  );
  const blocked = patchedMethods.some((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    return (
      descriptor &&
      (!Object.hasOwn(descriptor, "value") || !descriptor.writable)
    );
  });
  if (blocked || !Object.isExtensible(prototype)) {
    console.warn(
      "[Floor3D Pro Add-ons] Card prototype cannot be patched safely; no patches installed.",
    );
    return {
      status: "unsupported",
      reason: "Card prototype is not writable/extensible.",
    };
  }
  const original = Object.fromEntries(
    REQUIRED.map((name) => [name, prototype[name]]),
  );
  const configured = new WeakSet();
  const warnedLate = new WeakSet();
  const active = (card) => {
    if (configured.has(card)) return true;
    if (!warnedLate.has(card)) {
      warnedLate.add(card);
      console.warn(
        "[Floor3D Pro Add-ons] Card was configured before this resource loaded. Reload the dashboard to activate its rendering add-ons.",
      );
    }
    return false;
  };

  prototype.setConfig = function (config) {
    // Validate before altering the previous working card or its configuration.
    const options = parseOptions(config);
    hierarchyEnabled(config);
    configure(this, options);
    const result = original.setConfig.call(this, config);
    configured.add(this);
    if (this._modelready && this.isConnected !== false)
      safely(this, () => applyUpgrade(this));
    return result;
  };
  prototype._initobjects = function (model) {
    const groups = isGlbCard(this) ? captureHierarchy(model) : null;
    const result = original._initobjects.call(this, model);
    if (groups) {
      try {
        restoreHierarchy(this, groups);
      } catch {
        console.warn(
          "[Floor3D Pro Add-ons] GLB hierarchy repair failed; reload with glb_hierarchy_fix: false to use native behavior.",
        );
      }
    }
    return result;
  };
  prototype._firEvent = function (event) {
    return fireWithHierarchy(this, original._firEvent, event);
  };
  prototype._initAmbient = function (...args) {
    cleanup(this);
    const result = original._initAmbient.apply(this, args);
    if (active(this)) safely(this, () => applyUpgrade(this));
    return result;
  };
  prototype._onLoaded3DModel = function (...args) {
    cleanup(this);
    const result = original._onLoaded3DModel.apply(this, args);
    if (active(this))
      safely(this, () => {
        // A card may be configured/cancelled while detached, then connected before
        // its asynchronous model load. Native connectedCallback only requests a
        // connected render when the model is already ready, so recover here too.
        if (this.isConnected === true || this._isConnected === true)
          reconnect(this);
        else applyUpgrade(this);
      });
    return result;
  };
  prototype._updatelight = function (...args) {
    const result = original._updatelight.apply(this, args);
    if (configured.has(this)) safely(this, () => updateLights(this));
    return result;
  };
  prototype._requestRender = function (...args) {
    // Custom-element callbacks are cached at definition time by the browser.
    // The native cached connectedCallback dynamically calls this method instead.
    if (args[0] === "connected" && configured.has(this))
      safely(this, () => reconnect(this));
    // Level visibility changes must also refit pool lights, which live at scene level.
    if (args[0] === "level" && configured.has(this))
      safely(this, () => updateLights(this));
    return requestRender(this, original._requestRender, args);
  };
  prototype._setCamera = function (...args) {
    const result = original._setCamera.apply(this, args);
    if (configured.has(this)) safely(this, () => installPixelRatio(this));
    return result;
  };
  prototype._cancelScheduledRender = function (...args) {
    // Native disconnectedCallback sets _isConnected=false before calling here.
    // Do not clean up cancellations during normal connected rendering/editing.
    if (this._isConnected === false || this.isConnected === false)
      disconnect(this);
    return original._cancelScheduledRender.apply(this, args);
  };
  Object.defineProperty(prototype, PATCH_FLAG, { value: VERSION });
  // Prevent a later-loaded legacy resource from stacking its own wrappers over ours.
  for (const flag of LEGACY_FLAGS)
    Object.defineProperty(prototype, flag, { value: true });
  return { status: "installed", version: VERSION };
}
