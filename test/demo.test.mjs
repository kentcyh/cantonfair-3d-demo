import test from "node:test";
import assert from "node:assert/strict";
import { SUPPLIER_ORDER, SUPPLIERS } from "../js/catalog.js";
import { readFileSync } from "node:fs";
import {
  DRY_END_SECONDS,
  FOLD_END_SECONDS,
  MACHINE_GLOW_MAX,
  RING_EMISSIVE_BASE,
  RING_EMISSIVE_BOOST,
  WASH_END_SECONDS,
  WATER_DISC_OPACITY_SCALE,
  chipStep,
  machineGlow,
  phaseFromTime,
  ringEmissive,
  waterDiscOpacity,
  waterDropOpacity,
} from "../js/playback.js";

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

test("playback is wash, then dry, then fold", () => {
  assert.equal(phaseFromTime(0).step, 0);
  const wash = phaseFromTime(WASH_END_SECONDS / 2);
  assert.equal(wash.step, 1);
  assert.ok(wash.wash > 0.99);
  assert.equal(wash.dry, 0);

  const dry = phaseFromTime((WASH_END_SECONDS + DRY_END_SECONDS) / 2);
  assert.equal(dry.step, 2);
  assert.ok(dry.dry > 0.99);
  assert.equal(dry.wash, 0);

  const fold = phaseFromTime(FOLD_END_SECONDS);
  assert.equal(fold.step, 3);
  assert.equal(fold.fold, 1);
  assert.equal(fold.wash, 0);
  assert.equal(dry.fold, 0);
});

test("effects do not overlap and chips light only while playing", () => {
  for (let time = 0; time <= FOLD_END_SECONDS + 0.2; time += 0.05) {
    const phase = phaseFromTime(time);
    const activeCount = [phase.wash, phase.dry, phase.fold].filter((value) => value > 0).length;
    assert.ok(activeCount <= 1, `overlap at ${time}`);
  }
  assert.equal(chipStep(true, 1.5), 1);
  assert.equal(chipStep(true, 4.5), 2);
  assert.equal(chipStep(true, 8), 3);
  assert.equal(chipStep(false, FOLD_END_SECONDS), 0);
  assert.equal(chipStep(false, 1.5), 0);
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

  for (let time = 0; time <= FOLD_END_SECONDS; time += 0.05) {
    const phase = phaseFromTime(time);
    assert.ok(machineGlow(phase.wash) <= MACHINE_GLOW_MAX);
    assert.ok(machineGlow(phase.dry) <= MACHINE_GLOW_MAX);
    assert.ok(ringEmissive(phase.wash) <= RING_EMISSIVE_BASE + RING_EMISSIVE_BOOST);
    assert.ok(ringEmissive(phase.dry) <= RING_EMISSIVE_BASE + RING_EMISSIVE_BOOST);
  }
});

test("shop applies the capped wash and dry highlights", () => {
  const source = readFileSync(new URL("../js/shop.js", import.meta.url), "utf8");
  assert.match(source, /machineGlow\(wash\)/);
  assert.match(source, /machineGlow\(dry\)/);
  assert.match(source, /ringEmissive\(wash\)/);
  assert.match(source, /ringEmissive\(dry\)/);
  assert.match(source, /waterDiscOpacity\(intensity\)/);
  assert.match(source, /waterDropOpacity\(intensity\)/);
  assert.match(source, /sizeAttenuation:\s*false/);
  assert.equal(source.includes("wash * 2.2"), false);
  assert.equal(source.includes("dry * 2.2"), false);
  assert.equal(source.includes("wash * 1.3"), false);
  assert.equal(source.includes("dry * 1.3"), false);
  assert.equal(/size:\s*10\b/.test(source), false);
  const waterDisc = source.slice(source.indexOf("waterDisc = new THREE.Mesh"), source.indexOf("waterDisc.position"));
  assert.equal(waterDisc.includes("AdditiveBlending"), false);
  const waterDrops = source.slice(source.indexOf("function createWaterDrops"), source.indexOf("function createFrontLoader"));
  assert.equal(waterDrops.includes("AdditiveBlending"), false);
  assert.equal(waterDrops.includes("0xb8f3ff"), false);
});
