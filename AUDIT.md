# Provenance and validation boundaries

## Source

The starting point was the owner's existing render-upgrade module, version
`20261004i`, and GLB-hierarchy module, reviewed read-only. Their private location,
house model, dashboards and device configuration are intentionally omitted.
The renderer was reduced to a generic first-release scope; this is not an
unmodified copy or a promise of all legacy visual effects.

Public changes include bounded option parsing, identity-based GLB restoration,
render-state snapshots/restoration, lifecycle cleanup, render-filter resets,
timer/microtask invalidation, hidden-floor handling and compatibility checks.
The fixed-pool fitting algorithm is retained from the existing source.

The separately installed native card's public contract was checked against
`levonisyas/floor3dpro-card` `1.5.3-Pro.Faz.2.1`, whose package uses Three.js
`^0.130.1`. Development tests pin `three@0.130.1`. The native card is not bundled.
See NOTICE for upstream attribution and its MIT notice.

## Automated checks

- Node regression tests use real Three.js objects and synthetic cards/models.
- Compatibility tests cover missing methods, idempotent loading, legacy conflicts,
  late installation (adopting cards configured before the bundle loaded, with and
  without a loaded model, and invalid late options), and newer color-management APIs.
- Renderer tests cover opt-in/bypass, environment fallback, preserving an existing
  environment, configuration changes, multiple cards, pool overflow, hidden levels,
  cleanup, reconnect, culling, throttling and pixel-ratio restoration.
- GLB tests cover primitive identity/local transforms, OBJ bypass, direct-binding
  precedence, light-only ancestor resolution and restoration after native errors.
- The browser harness runs the built bundle with real GLTFLoader and WebGLRenderer
  against generated geometry. It uses a minimal native-card contract, not HA.
  It exercises real DOM removal/reattachment: native lifecycle callbacks are cached
  by custom-element registration, so cleanup/reconnect hooks use the dynamic native
  cancellation/connected-render methods rather than replacing those callbacks.
- Local packaging checks verify the one-file bundle, manifest/filename relationship,
  reproducible synthetic model and selected private-data patterns. This is a
  targeted hygiene check, not a claim that automated secret scanning proves absence
  of all personal information.
- CI is configured for those checks and official HACS validation (`category: plugin`).
  Remote HACS validation cannot be claimed before the repository is published.

## Not established by these checks

- Live installation through HACS and acceptance in a real HA test dashboard.
- Native-card visual/editor/cache/interaction correctness on every model.
- Pi/tablet/mobile GPU stability or cross-browser performance.
- A speedup on arbitrary hardware, or equivalence to the legacy night/glow effects.
- Default HACS catalog inclusion, a published release, or upstream endorsement.

No performance numbers from a private model are presented as portable benchmarks.
The bundled screenshot is explicitly labelled synthetic. Before public rollout,
complete the private test-dashboard checklist in docs/migration.md and run remote
HACS validation after publication. No production configuration was changed to
produce this repository.

## Local build results

For the initial v0.1.0 checkout, 75 Node regression tests passed, along with ESLint,
Prettier, bundle/source consistency, synthetic-model reproducibility and local
packaging/privacy checks. The headless Chrome 155 / software-WebGL smoke test
restored both GLB primitives, kept two pool lights stable across on/off changes,
restored native settings on removal, re-enabled on reattachment and raised no page
errors. This does not replace the live-HA and hardware acceptance work above.
