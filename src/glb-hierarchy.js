// SPDX-License-Identifier: MIT
import { hierarchyEnabled } from "./options.js";

export function isGlbCard(card) {
  const file = String(card?._config?.objfile ?? "")
    .split(/[?#]/)[0]
    .toLowerCase();
  return file.endsWith(".glb") && hierarchyEnabled(card._config);
}

// Remember identities before the native card flattens the model into its levels.
// Matching generated names is unsafe when a model contains similar object names.
export function captureHierarchy(model) {
  const groups = [];
  model?.traverse((object) => {
    if (object.type !== "Group" || !object.name) return;
    const primitives = object.children.filter(
      (child) => child.isMesh && child.geometry,
    );
    if (primitives.length > 1) groups.push({ group: object, primitives });
  });
  return groups;
}

export function restoreHierarchy(card, groups) {
  let attachedMeshes = 0;
  let reconciledGroups = 0;
  const levels = new Set((card._levels ?? []).filter(Boolean));
  for (const { group, primitives } of groups) {
    if (!levels.has(group.parent)) continue;
    const level = group.parent;
    const eligible = primitives.filter(
      (primitive) => primitive.parent === level,
    );
    if (eligible.length < 2) continue;
    // add(), not attach(): retain the primitives' original local GLTF transforms.
    // Native initialization uses add() too; attach() would preserve its broken placement.
    for (const primitive of eligible) group.add(primitive);
    group.updateWorldMatrix(true, true);
    attachedMeshes += eligible.length;
    reconciledGroups += 1;
  }
  card._floor3dproGlbHierarchyFix = { attachedMeshes, reconciledGroups };
}

function configured(card, name) {
  return (card._object_ids ?? []).some((group) =>
    (group?.objects ?? []).some((object) => object?.object_id === name),
  );
}

export function findLightAncestor(card, object) {
  let ancestor = object?.parent;
  while (ancestor) {
    for (
      let index = 0;
      index < (card._config?.entities ?? []).length;
      index += 1
    ) {
      if (card._config.entities[index]?.type3d !== "light") continue;
      if (
        (card._object_ids?.[index]?.objects ?? []).some(
          (entry) => entry.object_id === ancestor.name,
        )
      )
        return ancestor;
    }
    ancestor = ancestor.parent;
  }
  return null;
}

export function fireWithHierarchy(card, original, event) {
  if (!isGlbCard(card) || card._selectionModeEnabled)
    return original.call(card, event);
  const intersections = card._getintersect(event);
  const hit = intersections?.[0]?.object;
  const ancestor =
    hit?.name && !configured(card, hit.name)
      ? findLightAncestor(card, hit)
      : null;
  const resolved = ancestor
    ? [{ ...intersections[0], object: ancestor }, ...intersections.slice(1)]
    : intersections;
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
