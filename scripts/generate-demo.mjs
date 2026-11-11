// Entirely synthetic geometry; never reads a model or Home Assistant configuration.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function demoGlb() {
  const faces = [
    [
      [1, 0, 0],
      [
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
        [1, -1, 1],
      ],
    ],
    [
      [-1, 0, 0],
      [
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
        [-1, -1, -1],
      ],
    ],
    [
      [0, 1, 0],
      [
        [-1, 1, -1],
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
      ],
    ],
    [
      [0, -1, 0],
      [
        [-1, -1, 1],
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
      ],
    ],
    [
      [0, 0, 1],
      [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
    ],
    [
      [0, 0, -1],
      [
        [1, -1, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
      ],
    ],
  ];
  const parts = [];
  const bufferViews = [];
  const accessors = [];
  function attribute(values, min, max) {
    const array = new Float32Array(values);
    const byteOffset = parts.reduce((sum, part) => sum + part.length, 0);
    const bytes = Buffer.from(array.buffer);
    parts.push(bytes);
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: bytes.length,
      target: 34962,
    });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: values.length / 3,
      type: "VEC3",
      ...(min ? { min, max } : {}),
    });
    return accessors.length - 1;
  }
  function box(size, center, material) {
    const positions = [];
    const normals = [];
    for (const [normal, vertices] of faces)
      for (const index of [0, 1, 2, 0, 2, 3]) {
        positions.push(
          ...vertices[index].map(
            (value, axis) => center[axis] + (value * size[axis]) / 2,
          ),
        );
        normals.push(...normal);
      }
    return {
      attributes: {
        POSITION: attribute(
          positions,
          center.map((value, axis) => value - size[axis] / 2),
          center.map((value, axis) => value + size[axis] / 2),
        ),
        NORMAL: attribute(normals),
      },
      material,
    };
  }
  const floor = box([300, 2, 220], [0, -1, 0], 0);
  const base = box([10, 60, 10], [0, 30, 0], 1);
  const shade = box([35, 20, 35], [0, 70, 0], 2);
  const binary = Buffer.concat(parts);
  const json = {
    asset: {
      version: "2.0",
      generator: "floor3d-pro-addons synthetic demonstration generator",
    },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: "Demo_Floor", mesh: 0 },
      { name: "Demo_Lamp", mesh: 1 },
    ],
    meshes: [
      { name: "Demo_Floor", primitives: [floor] },
      { name: "Demo_Lamp", primitives: [base, shade] },
    ],
    materials: [
      {
        name: "Demo_Floor_Material",
        pbrMetallicRoughness: {
          baseColorFactor: [0.18, 0.25, 0.28, 1],
          metallicFactor: 0,
          roughnessFactor: 0.8,
        },
      },
      {
        name: "Demo_Base_Material",
        pbrMetallicRoughness: {
          baseColorFactor: [0.12, 0.16, 0.2, 1],
          metallicFactor: 0.3,
          roughnessFactor: 0.5,
        },
      },
      {
        name: "Demo_Shade_Material",
        pbrMetallicRoughness: {
          baseColorFactor: [0.95, 0.72, 0.32, 1],
          metallicFactor: 0,
          roughnessFactor: 0.7,
        },
      },
    ],
    buffers: [{ byteLength: binary.length }],
    bufferViews,
    accessors,
  };
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20);
  text.copy(padded);
  const output = Buffer.alloc(12 + 8 + padded.length + 8 + binary.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(padded.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(output, 20);
  output.writeUInt32LE(binary.length, 20 + padded.length);
  output.writeUInt32LE(0x004e4942, 24 + padded.length);
  binary.copy(output, 28 + padded.length);
  return output;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const directory = fileURLToPath(new URL("../examples/", import.meta.url));
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "demo.glb"), demoGlb());
  console.log("Generated examples/demo.glb from synthetic geometry only.");
}
