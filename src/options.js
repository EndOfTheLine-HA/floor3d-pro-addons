// SPDX-License-Identifier: MIT
export const VERSION = "0.1.0";
export const CARD_TAG = "floor3dpro-card";
export const SUPPORTED_CARD_VERSION = "1.5.3-Pro.Faz.2.1";

const DEFAULTS = {
  exposure: 1.6,
  ambient: 0.1,
  torch: 0.3,
  hide_off_lights: false,
  light_pool: false,
  hass_render: "all",
  hass_render_ms: 0,
  pixel_ratio: null,
  cast_shadows: true,
};
const POOL_DEFAULTS = { spots: 14, points: 2, shadows: 6, point_shadows: true };

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
        `[Floor3D Pro Add-ons] Unsupported ${label} option: ${key}. See docs/configuration.md.`,
      );
    }
  }
}

function number(value, min, max, label, integer = false) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(
      `[Floor3D Pro Add-ons] ${label} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}.`,
    );
  }
}

function boolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(
      `[Floor3D Pro Add-ons] ${label} must be true or false (not a quoted string).`,
    );
  }
}

export function parseOptions(config = {}) {
  const value = config.render_upgrade;
  if (
    value === undefined ||
    value === null ||
    value === false ||
    value === "no"
  )
    return null;
  const raw =
    value === true || value === "yes" ? {} : record(value, "render_upgrade");
  knownKeys(raw, DEFAULTS, "render_upgrade");
  const options = { ...DEFAULTS, ...raw };
  for (const key of ["exposure", "ambient", "torch"])
    number(options[key], 0, 10, key);
  for (const key of ["hide_off_lights", "cast_shadows"])
    boolean(options[key], key);
  number(options.hass_render_ms, 0, 60000, "hass_render_ms", true);
  if (!["all", "changed"].includes(options.hass_render))
    throw new Error(
      "[Floor3D Pro Add-ons] hass_render must be all or changed.",
    );
  if (options.pixel_ratio !== null)
    number(options.pixel_ratio, 0.25, 4, "pixel_ratio");
  if (options.light_pool !== false) {
    const poolValue =
      options.light_pool === true
        ? {}
        : record(options.light_pool, "light_pool");
    knownKeys(poolValue, POOL_DEFAULTS, "light_pool");
    const pool = { ...POOL_DEFAULTS, ...poolValue };
    number(pool.spots, 0, 64, "light_pool.spots", true);
    number(pool.points, 0, 16, "light_pool.points", true);
    number(pool.shadows, 0, 64, "light_pool.shadows", true);
    boolean(pool.point_shadows, "light_pool.point_shadows");
    if (pool.spots + pool.points === 0)
      throw new Error(
        "[Floor3D Pro Add-ons] light_pool must have at least one slot.",
      );
    // A smaller pool remains usable without also having to override the default shadow count.
    pool.shadows = Math.min(pool.shadows, pool.spots);
    options.light_pool = Object.freeze(pool);
  }
  // The native sky owns its renderer settings. Never override that path.
  if (config.sky === "yes" || config.sky === true) return null;
  return Object.freeze(options);
}

export function hierarchyEnabled(config = {}) {
  const value = config.glb_hierarchy_fix;
  if (value === undefined) return true;
  boolean(value, "glb_hierarchy_fix");
  return value;
}
