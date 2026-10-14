import test from "node:test";
import assert from "node:assert/strict";
import { SUPPLIER_ORDER, SUPPLIERS } from "../js/catalog.js";
import { LAYOUT } from "../js/layout.js";
import {
  DRY_END,
  FOLD_END,
  FOLD_FLIGHTS,
  GARMENT_COUNT,
  LOAD_END,
  LOAD_FLIGHTS,
  SHOW_END_SECONDS,
  TRANSFER_END,
  TRANSFER_FLIGHTS,
  WASH_END,
  armPose,
  chipStep,
  doorOpen,
  garmentSample,
  phaseFromTime,
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
