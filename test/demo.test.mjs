import test from "node:test";
import assert from "node:assert/strict";
import { SUPPLIER_ORDER, SUPPLIERS } from "../js/catalog.js";
import { readFileSync } from "node:fs";
import { LAYOUT } from "../js/layout.js";
import {
  DRY_END,
  FOLD_END,
  FOLD_FLIGHTS,
  GARMENT_COUNT,
  LOAD_END,
  LOAD_FLIGHTS,
  MACHINE_GLOW_MAX,
  RING_EMISSIVE_BASE,
  RING_EMISSIVE_BOOST,
  SHOW_END_SECONDS,
  TRANSFER_END,
  TRANSFER_FLIGHTS,
  WASH_END,
  WATER_DISC_OPACITY_SCALE,
  armPose,
  chipStep,
  doorOpen,
  garmentSample,
  machineGlow,
  phaseFromTime,
  ringEmissive,
  waterDiscOpacity,
  waterDropOpacity,
} from "../js/playback.js";

const BEATS = [
  ["load", 0, LOAD_END],
  ["wash", LOAD_END, WASH_END],
  ["transfer", WASH_END, TRANSFER_END],
  ["dry", TRANSFER_END, DRY_END],
  ["fold", DRY_END, FOLD_END],
  ["stack", FOLD_END, SHOW_END_SECONDS],
];

test("catalog matches Jenny's five draft categories", () => {
  assert.deepEqual(SUPPLIER_ORDER, ["pump", "seal", "motor", "mobility", "hand"]);
  assert.deepEqual(SUPPLIERS.pump, {
    zh: "泵",
    role: "清洗噴淋／循環供水",
    en: "Pump",
    color: "#3ec6ff",
  });
  assert.deepEqual(SUPPLIERS.seal, {
    zh: "密封",
    role: "防水／耐化學件",
    en: "Seal",
    color: "#3ddc97",
  });
  assert.deepEqual(SUPPLIERS.motor, {
    zh: "電機",
    role: "驅動滾筒／臂",
    en: "Motor",
    color: "#ff9f43",
  });
  assert.deepEqual(SUPPLIERS.mobility, {
    zh: "移動驅動",
    role: "底盤／輪式載具",
    en: "Mobility drive",
    color: "#b388ff",
  });
  assert.deepEqual(SUPPLIERS.hand, {
    zh: "靈巧手",
    role: "摺衫末端",
    en: "Dexterous hand",
    color: "#ff6b9a",
  });
});

test("six beats stay in the 2–4 second booth window", () => {
  assert.equal(BEATS.length, 6);
  for (const [name, start, end] of BEATS) {
    const duration = end - start;
    assert.ok(duration >= 2 && duration <= 4, `${name} is ${duration}s`);
  }
  assert.ok(SHOW_END_SECONDS <= 20);
  assert.equal(phaseFromTime(0).step, 0);
  assert.equal(phaseFromTime(SHOW_END_SECONDS).step, 6);
  assert.equal(phaseFromTime(SHOW_END_SECONDS).stack, 1);
});

test("chips follow the active beat only while playing", () => {
  for (const [index, [name, start, end]] of BEATS.entries()) {
    const mid = (start + end) / 2;
    const phase = phaseFromTime(mid);
    assert.equal(phase.step, index + 1, name);
    assert.ok(phase[name] > 0.45 && phase[name] < 0.55, name);
    assert.equal(chipStep(true, mid), index + 1);
    assert.equal(chipStep(false, mid), 0);
  }
  assert.equal(chipStep(false, SHOW_END_SECONDS), 0);
});

test("wash and dry effects do not overlap other beats", () => {
  for (let time = 0; time <= SHOW_END_SECONDS + 0.05; time += 0.05) {
    const phase = phaseFromTime(time);
    const active = ["load", "wash", "transfer", "dry", "fold", "stack"].filter((key) => phase[key] > 0);
    assert.ok(active.length <= 1, `overlap at ${time}: ${active.join(",")}`);
  }
  const washing = phaseFromTime((LOAD_END + WASH_END) / 2);
  assert.ok(washing.washIntensity > 0.9);
  assert.equal(washing.dryIntensity, 0);
  const drying = phaseFromTime((TRANSFER_END + DRY_END) / 2);
  assert.ok(drying.dryIntensity > 0.9);
  assert.equal(drying.washIntensity, 0);
  assert.equal(phaseFromTime(0).washIntensity, 0);
});

test("garments stay visible and never jump between stations", () => {
  const maxStep = 0.55;
  for (let index = 0; index < GARMENT_COUNT; index += 1) {
    let previous = garmentSample(0, index);
    assert.equal(previous.stage, "basket");
    assert.equal(previous.fold, 0);
    assert.ok(previous.x < LAYOUT.washerX);
    for (let time = 0.05; time <= SHOW_END_SECONDS + 0.05; time += 0.05) {
      const next = garmentSample(time, index);
      const distance = Math.hypot(next.x - previous.x, next.y - previous.y, next.z - previous.z);
      assert.ok(distance < maxStep, `garment ${index} jumped ${distance.toFixed(3)} at ${time.toFixed(2)}`);
      assert.ok(next.fold >= 0 && next.fold <= 1);
      previous = next;
    }
    const done = garmentSample(SHOW_END_SECONDS, index);
    assert.equal(done.fold, 1);
    assert.equal(done.stage, "stacked");
    assert.ok(Math.abs(done.x - LAYOUT.stack.x) < 0.001);
    assert.ok(Math.abs(done.z - LAYOUT.stack.z) < 0.001);
  }
  const tops = [0, 1, 2].map((index) => garmentSample(SHOW_END_SECONDS, index).y);
  assert.ok(tops[0] < tops[1] && tops[1] < tops[2]);
});

test("each garment visits washer, then dryer, then the fold table", () => {
  for (let index = 0; index < GARMENT_COUNT; index += 1) {
    const loadMid = (LOAD_FLIGHTS[index][0] + LOAD_FLIGHTS[index][1]) / 2;
    const washMid = (LOAD_END + WASH_END) / 2;
    const transferMid = (TRANSFER_FLIGHTS[index][0] + TRANSFER_FLIGHTS[index][1]) / 2;
    const dryMid = (TRANSFER_END + DRY_END) / 2;
    const foldMid = (FOLD_FLIGHTS[index][1] + FOLD_FLIGHTS[index][2]) / 2;
    assert.equal(garmentSample(loadMid, index).stage, "toWasher");
    const washing = garmentSample(washMid, index);
    assert.equal(washing.stage, "inWasher");
    assert.ok(Math.abs(washing.x - LAYOUT.washerX) < 0.2);
    assert.equal(garmentSample(transferMid, index).stage, "toDryer");
    const drying = garmentSample(dryMid, index);
    assert.equal(drying.stage, "inDryer");
    assert.ok(Math.abs(drying.x - LAYOUT.dryerX) < 0.2);
    const folding = garmentSample(foldMid, index);
    assert.equal(folding.stage, "folding");
    assert.ok(folding.fold > 0.2 && folding.fold < 0.8);
  }
});

test("doors are open while clothes pass and shut during tumble", () => {
  assert.ok(doorOpen((LOAD_FLIGHTS[0][0] + LOAD_FLIGHTS[0][1]) / 2).washer > 0.9);
  assert.ok(doorOpen((LOAD_END + WASH_END) / 2).washer < 0.05);
  assert.ok(doorOpen((TRANSFER_FLIGHTS[1][0] + TRANSFER_FLIGHTS[1][1]) / 2).washer > 0.9);
  assert.ok(doorOpen((TRANSFER_FLIGHTS[1][0] + TRANSFER_FLIGHTS[1][1]) / 2).dryer > 0.9);
  assert.ok(doorOpen((TRANSFER_END + DRY_END) / 2).dryer < 0.05);
  assert.ok(doorOpen((FOLD_FLIGHTS[0][0] + FOLD_FLIGHTS[0][1]) / 2).dryer > 0.9);
  assert.equal(doorOpen(0).washer, 0);
  assert.equal(doorOpen(SHOW_END_SECONDS).dryer, 0);
});

test("the arm grips during a fold and rests before the show", () => {
  const rest = armPose(0);
  const foldMid = (FOLD_FLIGHTS[1][1] + FOLD_FLIGHTS[1][2]) / 2;
  const pressing = armPose(foldMid);
  assert.ok(pressing.grip > rest.grip);
  assert.ok(pressing.grip > 0.8);
  const after = armPose(SHOW_END_SECONDS);
  assert.ok(Math.abs(after.grip - rest.grip) < 0.05);
});

test("wash and dry lights stay under the whiteout caps", () => {
  assert.ok(MACHINE_GLOW_MAX <= 0.45);
  assert.equal(machineGlow(0), 0);
  assert.equal(machineGlow(1), MACHINE_GLOW_MAX);
  assert.equal(machineGlow(2), MACHINE_GLOW_MAX);
  assert.equal(ringEmissive(0), RING_EMISSIVE_BASE);
  assert.equal(ringEmissive(1), RING_EMISSIVE_BASE + RING_EMISSIVE_BOOST);
  assert.ok(RING_EMISSIVE_BOOST < 0.35);
  assert.ok(ringEmissive(1) < 1);
  assert.equal(waterDiscOpacity(0), 0);
  assert.equal(waterDiscOpacity(1), WATER_DISC_OPACITY_SCALE);
  assert.ok(WATER_DISC_OPACITY_SCALE < 0.25);
  assert.ok(waterDropOpacity(1) < 0.6);

  for (let time = 0; time <= SHOW_END_SECONDS; time += 0.05) {
    const phase = phaseFromTime(time);
    assert.ok(machineGlow(phase.wash) <= MACHINE_GLOW_MAX);
    assert.ok(machineGlow(phase.dry) <= MACHINE_GLOW_MAX);
    assert.ok(ringEmissive(phase.wash) <= RING_EMISSIVE_BASE + RING_EMISSIVE_BOOST);
    assert.ok(ringEmissive(phase.dry) <= RING_EMISSIVE_BASE + RING_EMISSIVE_BOOST);
  }
});

test("shop applies the capped wash and dry highlights", () => {
  const source = readFileSync(new URL("../js/shop.js", import.meta.url), "utf8");
  assert.match(source, /washer\.glow\.intensity = machineGlow\(phase\.washIntensity\)/);
  assert.match(source, /dryer\.glow\.intensity = machineGlow\(phase\.dryIntensity\)/);
  assert.match(source, /washer\.ringMaterial\.emissiveIntensity = ringEmissive\(phase\.washIntensity\)/);
  assert.match(source, /dryer\.ringMaterial\.emissiveIntensity = ringEmissive\(phase\.dryIntensity\)/);
  assert.match(source, /waterDiscOpacity\(phase\.washIntensity\)/);
  assert.match(source, /waterDropOpacity\(phase\.washIntensity\)/);
  assert.equal(source.includes("washIntensity * 0.7"), false);
  assert.equal(source.includes("dryIntensity * 0.55"), false);
  assert.equal(source.includes("wash * 2.2"), false);
  assert.equal(source.includes("dry * 2.2"), false);
  assert.equal(source.includes("AdditiveBlending"), false);
  const waterDisc = source.slice(source.indexOf("waterDisc = new THREE.Mesh"), source.indexOf("waterDisc.position"));
  assert.equal(waterDisc.includes("AdditiveBlending"), false);
  const waterDrops = source.slice(source.indexOf("const waterMaterial"), source.indexOf("const airMaterial"));
  assert.equal(waterDrops.includes("AdditiveBlending"), false);
});
