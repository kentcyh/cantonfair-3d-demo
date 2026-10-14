/** Scene anchors shared by the show timeline and the meshes. Meters, Y up. */

export const LAYOUT = {
  washerX: -1.22,
  dryerX: 0.02,
  armX: 1.4,
  doorY: 0.86,
  doorZ: 0.4,
  doorRadius: 0.36,
  machineW: 1.08,
  machineH: 1.52,
  machineD: 0.68,
  foot: 0.09,
  basket: { x: -1.62, y: 0, z: 0.98 },
  foldSpot: { x: 1.28, y: 0.68, z: 0.52 },
  stack: { x: 1.28, y: 0.684, z: 0.24 },
};

/** Door-plane offsets. Small so a chunky garment stays inside the glass. */
export const DRUM_SLOTS = [
  { x: 0.045, y: 0.03 },
  { x: -0.05, y: 0.02 },
  { x: 0.01, y: -0.055 },
];

export const BASKET_POSES = [
  { x: -0.07, y: 0.16, z: 0.02, rotX: 0.22, rotY: 0.35, rotZ: 0.18 },
  { x: 0.08, y: 0.21, z: -0.03, rotX: -0.12, rotY: -0.25, rotZ: 0.28 },
  { x: 0.0, y: 0.28, z: 0.03, rotX: 0.18, rotY: 0.12, rotZ: -0.16 },
];

export const GARMENT_HALF_WIDTH = 0.085;
