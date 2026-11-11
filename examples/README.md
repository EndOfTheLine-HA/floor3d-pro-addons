# Synthetic example

`demo.glb` contains only a rectangular floor and a two-material lamp assembled by
`scripts/generate-demo.mjs`. It is not exported from any real home or purchased asset.
Regenerate it with `npm run demo:generate`; the packaging check verifies exact bytes.

The demo has no textures on purpose, so native material colors, pooling and GLB
bindings can be tried without texture files. The generated environment is skipped
with a warning on this textureless model. The browser smoke harness supplies an
in-memory white canvas texture to test that environment path too.

For a manual HA test:

1. Install the supported native Floor3D Pro card and register this add-on bundle.
2. Copy **only** `demo.glb` into a new `/config/www/floor3d-demo/` directory.
3. Copy `demo-card.yaml` into a private test dashboard. Replace `light.demo_lamp`
   with a light you intentionally want to visualize/control; it is a placeholder.
4. Keep `click: "no"` for visual checks. Enable native click actions only if you
   deliberately want the card to control that entity.

The repository's screenshot comes from `tests/browser/harness.html`, not HA.
