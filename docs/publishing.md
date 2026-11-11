# Publishing checklist

Building this directory does not create a GitHub repository, push commits, create
a release, or change Home Assistant. Those are separate authorized actions.

When publication is approved:

1. Create public `EndOfTheLine-HA/floor3d-pro-addons`, with issues enabled, the
   package description and topics such as `home-assistant`, `hacs`, `lovelace`,
   `floor3dpro` and `threejs`.
2. Publish the reviewed source, lockfile, docs, synthetic examples and generated
   `dist/floor3d-pro-addons.js`. Do not add node_modules or household assets.
3. Run both CI jobs. Official HACS validation must pass before claiming that
   remote check succeeded. The local package check is not the HACS validator.
4. Update the README's preparation/publication note once the public URL works.
5. Test HACS custom-repository installation and the native card in a separate HA
   test dashboard, with separate approval before changing live resources.
6. Publish a GitHub release when release acceptance is complete. Default HACS
   catalog submission is a later, separate process; no default inclusion is claimed.

The browser test's minimal contract and synthetic model are not proof that the
native card editor, cache, mobile GPU or a real household dashboard work correctly.
