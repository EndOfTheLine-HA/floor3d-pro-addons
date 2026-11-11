# Changelog

## 0.1.0

- Initial HACS Dashboard-plugin packaging with one self-contained JavaScript bundle.
- Opt-in sRGB output, ACES filmic tone mapping, exposure, ambient and torch controls.
- Generated environment using the native card's own texture class, when available.
- Fixed spot/point light pool with bounded configuration, merge/overflow diagnostics,
  stable light counts and shadow flags, and hidden-level handling.
- Optional off-light culling, entity-change filtering, render throttling, pixel-ratio
  control and mesh-shadow control for low-power panels.
- Identity-based GLB multi-material hierarchy repair and light-ancestor clicks.
- Lifecycle cleanup, configuration resets, legacy-resource conflict detection and
  unsupported-card/renderer guards.
- Synthetic model, automated regression tests, browser smoke harness and CI.

This first release intentionally does not port the legacy night/screens/decals/
wall-glow/fixture-glow/user-profile/resize-freeze options or the Blender pipeline.
