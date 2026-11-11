// SPDX-License-Identifier: MIT
// Derived from the existing render-upgrade light-pool implementation.
// Distances are in the model's centimetre coordinate system.
const SAME_ENTITY_EXTENT_CM = 900;
const CROSS_EXTENT_CM = 450;
const CROSS_COST_FACTOR = 4;
const MIN_AIM_DOT = 0.9;
const MERGE_THROW_CM = 250;
const MAX_CONE_SHADOW = (70 * Math.PI) / 180;
const MAX_CONE_PLAIN = (85 * Math.PI) / 180;

function membersOf(item) {
  return item.members ?? [item];
}

// Light a spot sends into its cone, relative to a point light of the same intensity
function fluxOf(item) {
  return item.spot
    ? item.intensity * (1 - Math.cos(item.angle))
    : item.intensity;
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
  const cost =
    ((fa * fb) / (fa + fb)) * a.position.distanceToSquared(b.position);
  return sameEntity ? cost : cost * CROSS_COST_FACTOR;
}

// One light standing in for all the members: their total flux from their
// flux-weighted centre, aimed along their average aim, with a cone wide enough
// to cover every member's footprint and the farthest member's reach.
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
        (member) => member.position.distanceTo(position) + member.distance,
      ),
    ),
  };

  if (!a.spot) {
    merged.intensity = total;
    return merged;
  }

  const direction = a.direction.clone().multiplyScalar(0);
  members.forEach((member, i) =>
    direction.add(member.direction.clone().multiplyScalar(weights[i])),
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
        MERGE_THROW_CM,
      ),
    );
  }

  merged.direction = direction;
  merged.angle = Math.min(angle, a.shadow ? MAX_CONE_SHADOW : MAX_CONE_PLAIN);
  merged.penumbra = Math.max(...members.map((member) => member.penumbra));
  merged.intensity = total / (1 - Math.cos(merged.angle));
  return merged;
}

// With `overflow`, lights that do not fit are handed back there instead of dropped.
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
      if (
        item.intensity * item.distance <
        list[weakest].intensity * list[weakest].distance
      ) {
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
    light.target.position
      .copy(item.position)
      .add(item.direction.clone().multiplyScalar(100));
    light.target.updateMatrixWorld();
  }
}

export { fitToCapacity, fluxOf, mergeCost, mergeItems, placeLight };
