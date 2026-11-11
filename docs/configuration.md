# Configuration

These keys extend an existing `custom:floor3dpro-card` configuration. They do not
replace the native card's model paths or entity/object bindings.

## Rendering options

`render_upgrade` accepts `"yes"`, `true`, or the options object below. Omit it, use
`false`, or use `"no"` to disable. Use actual YAML booleans for boolean fields
inside the object; quoted `"false"` is rejected.

| Option            | Default | Allowed values / effect                                                        |
| ----------------- | ------- | ------------------------------------------------------------------------------ |
| `exposure`        | `1.6`   | Number 0–10; ACES exposure                                                     |
| `ambient`         | `0.1`   | Number 0–10; native ambient-light intensity                                    |
| `torch`           | `0.3`   | Number 0–10; native camera torch intensity                                     |
| `hide_off_lights` | `false` | Hide configured entity lights at zero intensity; no pooling                    |
| `light_pool`      | `false` | `true` for defaults, or a pool options object                                  |
| `hass_render`     | `all`   | `changed` filters `hass` renders to configured entity state objects            |
| `hass_render_ms`  | `0`     | Integer 0–60000; minimum interval for `hass` renders, with one trailing render |
| `pixel_ratio`     | native  | Number 0.25–4; lower values reduce pixel cost and sharpness                    |
| `cast_shadows`    | `true`  | `false` disables mesh casting, not the renderer's shadow-map path              |

Rendering changes are bypassed with native `sky: "yes"`. If no model texture can
supply a compatible texture constructor, or a 2D canvas is unavailable, the
generated environment is skipped with a console warning. Existing environments
are preserved. Model geometry and original materials are not rewritten.

`hide_off_lights` is superseded by `light_pool`. Culling can introduce a shader
variant when the visible-light count changes. Pooling aims to avoid that particular
source of recompilation; it does not prevent every possible shader compilation.

## Pool options

| Option          | Default | Allowed values                                            |
| --------------- | ------- | --------------------------------------------------------- |
| `spots`         | `14`    | Integer 0–64                                              |
| `points`        | `2`     | Integer 0–16                                              |
| `shadows`       | `6`     | Integer 0–64; clamped to `spots`                          |
| `point_shadows` | `true`  | Boolean; point shadows cost up to six map faces per light |

At least one spot or point slot is required. A light class is borrowed only when
the native model contains a configured entity light of that type. A slot count for
an absent class does not create that class. Zero slots for a type omit that type's
lit fixtures, with overflow diagnostics; size the pool for your model.

Fixed pool lights remain visible with zero intensity when unused. Their counts
and `castShadow` flags are not toggled during on/off changes. Original lights are
hidden while pooled, then restored when the add-on is disabled or disconnected.
Pool lights live in world space; hidden floors are excluded when the native level
selector requests its render.

Fitting uses the original light-pool algorithm in centimetres. Nearby compatible
lights merge by flux/distance cost. Incompatible shadow classes or very different
aims do not merge; cross-entity shadow merges are not attempted. Shadow overflow
can use an unshadowed slot. If fitting still fails, weaker lights are omitted and
the console reports the count. This changes the approximation; it is not a
physically exact renderer or a promise to display every light unchanged.

For local inspection of one card, `_floor3dproAddons.pool` contains counts for
`lit`, `merged`, `dropped`, `spots`, `points` and `shadowed`. Do not publish a full
card object or dashboard dump in an issue. Global `window.floor3dProAddons` contains
only package and compatibility-installation status, no household configuration.

## Low-power panel example

Start conservatively on a separate test dashboard:

```yaml
render_upgrade:
  light_pool:
    spots: 8
    points: 1
    shadows: 1
    point_shadows: false
  pixel_ratio: 0.5
  cast_shadows: false
  hass_render: changed
  hass_render_ms: 1000
```

This trades sharpness, shadow detail and state-update immediacy for lower work.
Camera/control interaction is not throttled. Entity filtering considers the
card's configured `entities[].entity`, including attribute-only changes; it does
not discover indirect dependencies inside arbitrary templates. Leave it at `all`
for cards with dependencies outside those entities. It is not a universal Pi/GPU
fix; test your browser and driver. No GPU workaround is enabled automatically.

The private scripts' `freeze_canvas`, `user_options`, `night`, `screens` and
advanced pool effects are deliberately unsupported in this release. Do not copy
their configuration unchanged.

## GLB repair

Enabled by default for an `objfile` ending in `.glb`, ignoring query/fragment suffixes.
Set this top-level key to bypass it:

```yaml
glb_hierarchy_fix: false
```

Before native level initialization, the add-on records named groups with more
than one direct renderable primitive. It restores only those exact children when
they and the group were flattened into the same level. It does not guess by names,
move primitives between floors, or touch OBJ hierarchy. Primitive local transforms
are retained. A click on an unbound child can resolve to the nearest configured
`type3d: light` ancestor; explicit child bindings and selection mode win.
