import { BASKET_POSES, DRUM_SLOTS, GARMENT_HALF_WIDTH, LAYOUT } from "./layout.js";

/** Six booth beats, each 2–4 seconds. Total stays under a trade-show minute. */
export const GARMENT_COUNT = 3;

export const LOAD_END = 3.2;
export const WASH_END = 6.2;
export const TRANSFER_END = 9.6;
export const DRY_END = 12.6;
export const FOLD_END = 16.5;
export const SHOW_END_SECONDS = 18.9;

export const LOAD_FLIGHTS = [
  [0.36, 1.1],
  [1.16, 1.9],
  [1.96, 2.7],
];

export const TRANSFER_FLIGHTS = [
  [6.58, 7.42],
  [7.5, 8.34],
  [8.42, 9.26],
];

/** fly start, fold start, place start, place end */
export const FOLD_FLIGHTS = [
  [12.9, 13.32, 13.78, 14.12],
  [14.12, 14.54, 15.0, 15.34],
  [15.34, 15.76, 16.22, 16.5],
];

const BEATS = [
  [1, "load", 0, LOAD_END],
  [2, "wash", LOAD_END, WASH_END],
  [3, "transfer", WASH_END, TRANSFER_END],
  [4, "dry", TRANSFER_END, DRY_END],
  [5, "fold", DRY_END, FOLD_END],
  [6, "stack", FOLD_END, SHOW_END_SECONDS],
];

const IDLE_PHASE = {
  step: 0,
  load: 0,
  wash: 0,
  transfer: 0,
  dry: 0,
  fold: 0,
  stack: 0,
  washIntensity: 0,
  dryIntensity: 0,
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function smootherstep(value) {
  const unit = clamp(value, 0, 1);
  return unit * unit * unit * (unit * (unit * 6 - 15) + 10);
}

export function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function holdEnvelope(unit) {
  const edge = 0.16;
  if (unit <= 0 || unit >= 1) return 0;
  if (unit < edge) return smootherstep(unit / edge);
  if (unit > 1 - edge) return smootherstep((1 - unit) / edge);
  return 1;
}

function pulse(time, openStart, openEnd, closeStart, closeEnd) {
  if (time <= openStart || time >= closeEnd) return 0;
  if (time < openEnd) return smootherstep((time - openStart) / (openEnd - openStart));
  if (time < closeStart) return 1;
  return 1 - smootherstep((time - closeStart) / (closeEnd - closeStart));
}

export function phaseFromTime(time) {
  if (time <= 0) return { ...IDLE_PHASE };
  if (time >= SHOW_END_SECONDS) {
    return { ...IDLE_PHASE, step: 6, stack: 1 };
  }
  const phase = { ...IDLE_PHASE };
  for (const [step, key, start, end] of BEATS) {
    if (time < end) {
      phase.step = step;
      phase[key] = (time - start) / (end - start);
      break;
    }
  }
  if (phase.step === 2) phase.washIntensity = holdEnvelope(phase.wash);
  if (phase.step === 4) phase.dryIntensity = holdEnvelope(phase.dry);
  return phase;
}

/** Chips highlight only while Play is running. */
export function chipStep(playing, time) {
  if (!playing) return 0;
  return phaseFromTime(time).step;
}

function spinAngle(time, start, end) {
  if (time <= start || time >= end) return 0;
  const unit = (time - start) / (end - start);
  const turns = smootherstep(unit) * Math.PI * 4;
  const rock = Math.sin(unit * Math.PI * 6) * 0.55 * Math.sin(unit * Math.PI);
  return turns + rock;
}

export function washerSpinAngle(time) {
  return spinAngle(time, LOAD_END, WASH_END);
}

export function dryerSpinAngle(time) {
  return spinAngle(time, TRANSFER_END, DRY_END);
}

export function doorOpen(time) {
  const washer = Math.max(
    pulse(time, 0.06, 0.32, 2.78, 3.14),
    pulse(time, 6.28, 6.54, 9.3, 9.56),
  );
  const dryer = Math.max(
    pulse(time, 6.28, 6.54, 9.3, 9.56),
    pulse(time, 12.58, 12.86, 15.82, 16.22),
  );
  return { washer, dryer };
}

function rotateSlot(centerX, centerY, centerZ, slot, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: centerX + slot.x * cosine - slot.y * sine,
    y: centerY + slot.x * sine + slot.y * cosine,
    z: centerZ,
  };
}

export function washerPoint(index, angle) {
  return rotateSlot(LAYOUT.washerX, LAYOUT.doorY, LAYOUT.doorZ - 0.02, DRUM_SLOTS[index], angle);
}

export function dryerPoint(index, angle) {
  return rotateSlot(LAYOUT.dryerX, LAYOUT.doorY, LAYOUT.doorZ - 0.02, DRUM_SLOTS[index], angle);
}

function basketPoint(index) {
  const pose = BASKET_POSES[index];
  return {
    x: LAYOUT.basket.x + pose.x,
    y: LAYOUT.basket.y + pose.y,
    z: LAYOUT.basket.z + pose.z,
    rotX: pose.rotX,
    rotY: pose.rotY,
    rotZ: pose.rotZ,
  };
}

function arc(from, to, amount, height) {
  const eased = smootherstep(amount);
  return {
    x: lerp(from.x, to.x, eased),
    y: lerp(from.y, to.y, eased) + Math.sin(eased * Math.PI) * height,
    z: lerp(from.z, to.z, eased),
  };
}

function stackPose(index, align) {
  const roughX = (index - 1) * 0.055;
  const roughZ = (index - 1) * 0.028;
  const roughYaw = (index - 1) * 0.2;
  return {
    x: LAYOUT.stack.x + roughX * (1 - align),
    y: LAYOUT.stack.y + index * 0.034,
    z: LAYOUT.stack.z + roughZ * (1 - align),
    rotY: roughYaw * (1 - align),
  };
}

function upright(point, angle) {
  return {
    x: point.x,
    y: point.y,
    z: point.z,
    rotX: Math.PI / 2,
    rotY: 0,
    rotZ: angle,
    fold: 0,
  };
}

/**
 * World pose of one garment. Position, rotation, and fold are continuous in time
 * so the mesh never hides or jumps during a transfer.
 */
export function garmentSample(time, index) {
  if (index < 0 || index >= GARMENT_COUNT) throw new Error(`Bad garment ${index}`);
  const moment = Math.max(0, time);
  const basket = basketPoint(index);
  const load = LOAD_FLIGHTS[index];
  const transfer = TRANSFER_FLIGHTS[index];
  const foldWindow = FOLD_FLIGHTS[index];
  const washerHome = washerPoint(index, 0);
  const dryerHome = dryerPoint(index, 0);

  if (moment < load[0]) {
    return { ...basket, fold: 0, stage: "basket" };
  }
  if (moment < load[1]) {
    const amount = (moment - load[0]) / (load[1] - load[0]);
    const point = arc(basket, washerHome, amount, 0.34);
    const eased = smootherstep(amount);
    return {
      ...point,
      rotX: lerp(basket.rotX, Math.PI / 2, eased),
      rotY: lerp(basket.rotY, 0, eased),
      rotZ: lerp(basket.rotZ, 0, eased),
      fold: 0,
      stage: "toWasher",
    };
  }
  if (moment < transfer[0]) {
    return { ...upright(washerPoint(index, washerSpinAngle(moment)), washerSpinAngle(moment)), stage: "inWasher" };
  }
  if (moment < transfer[1]) {
    const amount = (moment - transfer[0]) / (transfer[1] - transfer[0]);
    const point = arc(washerHome, dryerHome, amount, 0.28);
    return { ...point, rotX: Math.PI / 2, rotY: 0, rotZ: 0, fold: 0, stage: "toDryer" };
  }
  if (moment < foldWindow[0]) {
    const angle = dryerSpinAngle(moment);
    return { ...upright(dryerPoint(index, angle), angle), stage: "inDryer" };
  }
  if (moment < foldWindow[1]) {
    const amount = (moment - foldWindow[0]) / (foldWindow[1] - foldWindow[0]);
    const point = arc(dryerHome, LAYOUT.foldSpot, amount, 0.32);
    const eased = smootherstep(amount);
    return {
      ...point,
      rotX: lerp(Math.PI / 2, 0, eased),
      rotY: 0,
      rotZ: 0,
      fold: 0,
      stage: "toTable",
    };
  }
  if (moment < foldWindow[2]) {
    const amount = smootherstep((moment - foldWindow[1]) / (foldWindow[2] - foldWindow[1]));
    return {
      x: LAYOUT.foldSpot.x + amount * GARMENT_HALF_WIDTH,
      y: LAYOUT.foldSpot.y + amount * 0.012,
      z: LAYOUT.foldSpot.z,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      fold: amount,
      stage: "folding",
    };
  }
  if (moment < foldWindow[3]) {
    const amount = smootherstep((moment - foldWindow[2]) / (foldWindow[3] - foldWindow[2]));
    const placed = stackPose(index, 0);
    return {
      x: lerp(LAYOUT.foldSpot.x + GARMENT_HALF_WIDTH, placed.x, amount),
      y: lerp(LAYOUT.foldSpot.y + 0.012, placed.y, amount),
      z: lerp(LAYOUT.foldSpot.z, placed.z, amount),
      rotX: 0,
      rotY: lerp(0, placed.rotY, amount),
      rotZ: 0,
      fold: 1,
      stage: "placing",
    };
  }
  const align = moment <= FOLD_END ? 0 : smootherstep((moment - FOLD_END) / (SHOW_END_SECONDS - FOLD_END));
  const piled = stackPose(index, Math.min(1, align));
  return {
    x: piled.x,
    y: piled.y,
    z: piled.z,
    rotX: 0,
    rotY: piled.rotY,
    rotZ: 0,
    fold: 1,
    stage: align >= 1 ? "stacked" : "settling",
  };
}

const ARM_REST = { shoulderX: 0.5, shoulderZ: -0.9, elbowZ: 0.95, grip: 0.12 };
const ARM_REACH = { shoulderX: 1.55, shoulderZ: -0.35, elbowZ: 1.25, grip: 0.2 };
const ARM_PRESS = { shoulderX: 2.32, shoulderZ: -0.6, elbowZ: 1.72, grip: 1 };
const ARM_SET = { shoulderX: 2.6, shoulderZ: -0.75, elbowZ: 2.1, grip: 0.35 };

function lerpPose(from, to, amount) {
  return {
    shoulderX: lerp(from.shoulderX, to.shoulderX, amount),
    shoulderZ: lerp(from.shoulderZ, to.shoulderZ, amount),
    elbowZ: lerp(from.elbowZ, to.elbowZ, amount),
    grip: lerp(from.grip, to.grip, amount),
  };
}

/** Keyed to the same fold windows as the garments, so the hand meets the cloth. */
export function armPose(time) {
  const moment = Math.max(0, time);
  const first = FOLD_FLIGHTS[0][0];
  const lastEnd = FOLD_FLIGHTS[GARMENT_COUNT - 1][3];
  if (moment < first) return { ...ARM_REST };
  if (moment >= lastEnd) {
    const amount = smootherstep(clamp((moment - lastEnd) / 0.7, 0, 1));
    return lerpPose(ARM_SET, ARM_REST, amount);
  }
  for (let index = 0; index < GARMENT_COUNT; index += 1) {
    const [flyStart, foldStart, placeStart, placeEnd] = FOLD_FLIGHTS[index];
    if (moment < flyStart || moment >= placeEnd) continue;
    if (moment < foldStart) {
      const from = index === 0 ? ARM_REST : ARM_SET;
      const amount = smootherstep((moment - flyStart) / (foldStart - flyStart));
      return lerpPose(from, ARM_REACH, amount);
    }
    if (moment < placeStart) {
      const amount = smootherstep((moment - foldStart) / (placeStart - foldStart));
      const pose = lerpPose(ARM_REACH, ARM_PRESS, amount);
      pose.grip = smootherstep(Math.min(1, amount / 0.35));
      return pose;
    }
    const amount = smootherstep((moment - placeStart) / (placeEnd - placeStart));
    return lerpPose(ARM_PRESS, ARM_SET, amount);
  }
  return { ...ARM_REST };
}
