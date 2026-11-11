# Migration and rollback

Do not change a working production dashboard until a copy has been tested.
This repository does not modify HA resources, dashboards, models or installations.

## From separate legacy scripts

1. Back up your resource list and card configuration privately. Keep your model
   and the original scripts in private storage, not this repository.
2. Duplicate the dashboard/card for testing. Compare the supported options in
   [configuration.md](configuration.md) against every `render_upgrade` option.
3. Remove unsupported options from the test copy. Their absence changes appearance;
   do not assume the v0.1.0 pool matches legacy fixture glow, decals or night effects.
4. Replace the two legacy module resources with the single bundled resource. Do
   not delete the old files while you may still need them for rollback.
5. Fully reload the browser. If a legacy module was already installed on the card
   class, this bundle deliberately refuses to stack another set of patches.
6. Inspect the synthetic example, then your private test card. Check original
   bindings, brightness, on/off changes, colors, levels, shadows and light clicks.
7. Navigate away and back, reload and edit the test configuration. Watch console
   diagnostics for dropped lights, missing APIs or late resource installation.
8. Promote only after you accept the appearance and behavior on each client.

## Disable rendering only

Remove `render_upgrade`, or set it to `false`. On a configured card the add-on
restores the renderer settings it captured, original entity-light visibility,
mesh shadow flags and pixel-ratio behavior. It removes/disposes its own environment
and pooled shadow targets, not your model geometry or materials. Reloading is
still the cleanest way to compare to the native card.

## Full rollback

Remove the bundle's dashboard resource and fully reload. If returning to the
private legacy scripts, restore their resource URLs and original card options
from your private backup before reloading. Prototype patches already installed
cannot be uninstalled merely by deleting a URL from a running browser tab.
HACS uninstalling the add-on is optional after its resource has been removed.

Changing backend integrations, restarting HA, or touching Bark Alerts/Pentek/
No Hassle AV is not part of this workflow.
