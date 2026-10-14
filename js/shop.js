import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { RoundedBoxGeometry } from "../vendor/RoundedBoxGeometry.js";
import { SUPPLIERS } from "./catalog.js";

// Procedural stand-ins. TODO: replace with real glTF machines when models arrive.

const MAX_PIXEL_RATIO = 2;
const WASHER_X = -1.46;
const DRYER_X = 0;
const ARM_X = 1.46;
const MACHINE_WIDTH = 1.02;
const MACHINE_HEIGHT = 1.46;
const MACHINE_DEPTH = 0.7;
const MACHINE_FOOT = 0.1;
const WASHER_ACCENT = 0x3ecbff;
const DRYER_ACCENT = 0xb388ff;
const ARM_ACCENT = 0x3ee0a2;
const WATER_DROP_COUNT = 28;
const AIR_STREAK_COUNT = 12;
const EXPLODE_READY = 0.65;
const SELECT_SCALE = 1.08;

const ARM_REST = { shoulderX: 0.4, shoulderZ: -0.95, elbowZ: 0.85 };
const ARM_POSES = [
  { at: 0, ...ARM_REST },
  { at: 0.32, shoulderX: 1.45, shoulderZ: -0.1, elbowZ: 0.15 },
  { at: 0.68, shoulderX: 1.2, shoulderZ: 0.25, elbowZ: 2.15 },
  { at: 1, ...ARM_REST },
];

function rounded(width, height, depth, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2, depth / 2);
  if (safeRadius <= 0.001) return new THREE.BoxGeometry(width, height, depth);
  return new RoundedBoxGeometry(width, height, depth, 2, safeRadius);
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function poseAt(fold) {
  const clamped = Math.min(1, Math.max(0, fold));
  let previous = ARM_POSES[0];
  for (let index = 1; index < ARM_POSES.length; index += 1) {
    const next = ARM_POSES[index];
    if (clamped <= next.at) {
      const span = next.at - previous.at;
      const local = span === 0 ? 1 : (clamped - previous.at) / span;
      return {
        shoulderX: lerp(previous.shoulderX, next.shoulderX, local),
        shoulderZ: lerp(previous.shoulderZ, next.shoulderZ, local),
        elbowZ: lerp(previous.elbowZ, next.elbowZ, local),
      };
    }
    previous = next;
  }
  return ARM_POSES[ARM_POSES.length - 1];
}

export function createShop(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "default",
  });
  if (!renderer.getContext()) return null;

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x0b1220, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1220);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.48, 9.15);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.98, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.45;
  controls.zoomSpeed = 0.65;
  controls.minDistance = 7.3;
  controls.maxDistance = 12;
  controls.minPolarAngle = Math.PI / 2 - 0.48;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minAzimuthAngle = -0.55;
  controls.maxAzimuthAngle = 0.55;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.update();

  const parts = [];
  const partsById = new Map();
  const proxyMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  function addProxy(object, radius) {
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), proxyMaterial);
    proxy.userData.pickProxy = true;
    object.add(proxy);
  }

  function isolateMaterials(object) {
    object.traverse((child) => {
      if (!child.isMesh || !child.material || child.userData.pickProxy) return;
      child.material = child.material.clone();
      if (child.material.emissive) {
        child.userData.baseEmissive = child.material.emissive.clone();
        child.userData.baseEmissiveIntensity = child.material.emissiveIntensity ?? 1;
      }
    });
  }

  function registerPart(object, category, explodeOffset, id) {
    if (!SUPPLIERS[category]) throw new Error(`Unknown supplier category: ${category}`);
    object.userData.id = id;
    object.userData.category = category;
    object.userData.basePosition = object.position.clone();
    object.userData.explodeOffset = explodeOffset.clone();
    object.userData.baseScale = object.scale.x || 1;
    isolateMaterials(object);
    parts.push(object);
    partsById.set(id, object);
  }

  const pumpMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f8fb3,
    roughness: 0.38,
    metalness: 0.5,
    emissive: 0x0c3a4d,
    emissiveIntensity: 0.45,
  });
  const sealMaterial = new THREE.MeshStandardMaterial({
    color: 0x1f9d68,
    roughness: 0.86,
    metalness: 0,
    emissive: 0x0d3a28,
    emissiveIntensity: 0.3,
  });
  const motorMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4843c,
    roughness: 0.42,
    metalness: 0.45,
    emissive: 0x4a2810,
    emissiveIntensity: 0.35,
  });
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0xc5ced6,
    roughness: 0.32,
    metalness: 0.72,
  });
  const drumMaterial = metalMaterial;
  const handMaterial = new THREE.MeshStandardMaterial({
    color: 0xe07a98,
    roughness: 0.4,
    metalness: 0.32,
    emissive: 0x5a2438,
    emissiveIntensity: 0.35,
  });
  const mobilityMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a2d5c,
    roughness: 0.5,
    metalness: 0.32,
    emissive: 0x2a1858,
    emissiveIntensity: 0.4,
  });
  const armLinkMaterial = new THREE.MeshStandardMaterial({
    color: 0x6fbfa6,
    roughness: 0.42,
    metalness: 0.35,
    emissive: 0x145041,
    emissiveIntensity: 0.35,
  });
  const clothMaterial = new THREE.MeshStandardMaterial({
    color: 0xd7e6f5,
    roughness: 0.92,
    metalness: 0,
  });
  const tableMaterial = new THREE.MeshStandardMaterial({
    color: 0x2c3848,
    roughness: 0.7,
    metalness: 0.15,
  });

  function createPump() {
    const group = new THREE.Group();
    const housing = new THREE.Mesh(rounded(0.26, 0.14, 0.18, 0.03), pumpMaterial);
    group.add(housing);
    const volute = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 14), pumpMaterial);
    volute.rotation.x = Math.PI / 2;
    volute.position.z = 0.1;
    group.add(volute);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 8), pumpMaterial);
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(0.16, 0.02, 0);
    group.add(nozzle);
    addProxy(group, 0.18);
    return group;
  }

  function createDrumMotor(uniformScale) {
    const group = new THREE.Group();
    group.scale.setScalar(uniformScale);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 14), motorMaterial);
    can.rotation.x = Math.PI / 2;
    group.add(can);
    for (let index = 0; index < 6; index += 1) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.14, 0.035), motorMaterial);
      const angle = (index / 6) * Math.PI * 2;
      fin.position.set(Math.cos(angle) * 0.12, Math.sin(angle) * 0.12, 0);
      group.add(fin);
    }
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), metalMaterial);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.14;
    group.add(shaft);
    addProxy(group, 0.2);
    return group;
  }

  function createBlower() {
    const group = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 16), motorMaterial);
    housing.rotation.x = Math.PI / 2;
    group.add(housing);
    for (let index = 0; index < 4; index += 1) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.028, 0.018), motorMaterial);
      blade.rotation.z = (index / 4) * Math.PI;
      group.add(blade);
    }
    addProxy(group, 0.2);
    return group;
  }

  function createWaterDrops(radius) {
    const positions = new Float32Array(WATER_DROP_COUNT * 3);
    const phases = new Float32Array(WATER_DROP_COUNT);
    const radii = new Float32Array(WATER_DROP_COUNT);
    for (let index = 0; index < WATER_DROP_COUNT; index += 1) {
      phases[index] = (index / WATER_DROP_COUNT) * Math.PI * 2;
      radii[index] = radius * (0.28 + (index % 5) * 0.11);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xb8f3ff,
      size: 10,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    points.raycast = () => {};
    points.visible = false;
    return { points, positions, phases, radii, material, geometry };
  }

  function createFrontLoader(kind, xPosition) {
    const isWasher = kind === "washer";
    const accent = isWasher ? WASHER_ACCENT : DRYER_ACCENT;
    const root = new THREE.Group();
    root.position.set(xPosition, 0, 0);

    const cabinetMaterial = new THREE.MeshStandardMaterial({
      color: isWasher ? 0x3d5166 : 0x433c58,
      roughness: 0.46,
      metalness: 0.28,
    });
    const body = new THREE.Mesh(
      rounded(MACHINE_WIDTH, MACHINE_HEIGHT, MACHINE_DEPTH, 0.07),
      cabinetMaterial,
    );
    body.position.y = MACHINE_FOOT + MACHINE_HEIGHT / 2;
    root.add(body);

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(MACHINE_WIDTH + 0.08, 0.03, MACHINE_DEPTH + 0.08),
      new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 0.55,
        roughness: 0.35,
      }),
    );
    plinth.position.y = 0.02;
    plinth.raycast = () => {};
    root.add(plinth);

    const footGeometry = new THREE.CylinderGeometry(0.04, 0.046, MACHINE_FOOT, 8);
    const footMaterial = new THREE.MeshStandardMaterial({ color: 0x1a212c, roughness: 0.8 });
    const footX = MACHINE_WIDTH / 2 - 0.12;
    const footZ = MACHINE_DEPTH / 2 - 0.12;
    for (const signX of [-1, 1]) {
      for (const signZ of [-1, 1]) {
        const foot = new THREE.Mesh(footGeometry, footMaterial);
        foot.position.set(signX * footX, MACHINE_FOOT / 2, signZ * footZ);
        root.add(foot);
      }
    }

    const doorCenterY = MACHINE_FOOT + MACHINE_HEIGHT * (isWasher ? 0.46 : 0.52);
    const doorRadius = isWasher ? 0.34 : 0.3;
    const doorZ = MACHINE_DEPTH / 2 + 0.02;

    const recess = new THREE.Mesh(
      new THREE.CylinderGeometry(doorRadius - 0.02, doorRadius - 0.02, 0.1, 24),
      new THREE.MeshStandardMaterial({ color: 0x0c121b, roughness: 0.55, metalness: 0.15 }),
    );
    recess.rotation.x = Math.PI / 2;
    recess.position.set(0, doorCenterY, doorZ - 0.05);
    root.add(recess);

    const spinner = new THREE.Group();
    spinner.rotation.x = Math.PI / 2;
    spinner.position.set(0, doorCenterY, doorZ - 0.02);
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(doorRadius - 0.07, doorRadius - 0.07, 0.05, 24),
      drumMaterial,
    );
    const holeMaterial = new THREE.MeshStandardMaterial({
      color: 0x1c242e,
      roughness: 0.5,
      metalness: 0.4,
    });
    const holeGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8);
    for (let index = 0; index < 8; index += 1) {
      const hole = new THREE.Mesh(holeGeometry, holeMaterial);
      const angle = (index / 8) * Math.PI * 2;
      const holeRadius = doorRadius * 0.42;
      hole.position.set(Math.cos(angle) * holeRadius, 0.03, Math.sin(angle) * holeRadius);
      drum.add(hole);
    }
    for (let index = 0; index < 3; index += 1) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.09), drumMaterial);
      const angle = (index / 3) * Math.PI * 2;
      rib.position.set(Math.cos(angle) * doorRadius * 0.52, 0, Math.sin(angle) * doorRadius * 0.52);
      rib.rotation.y = -angle;
      drum.add(rib);
    }
    spinner.add(drum);
    root.add(spinner);

    const ringMaterial = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 0.85,
      roughness: 0.32,
      metalness: 0.18,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(doorRadius, 0.03, 8, 28), ringMaterial);
    ring.position.set(0, doorCenterY, doorZ + 0.012);
    root.add(ring);

    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(doorRadius - 0.045, 28),
      new THREE.MeshStandardMaterial({
        color: isWasher ? 0x9adfff : 0xd0c4ff,
        transparent: true,
        opacity: 0.18,
        roughness: 0.05,
        metalness: 0.05,
        depthWrite: false,
      }),
    );
    glass.position.set(0, doorCenterY, doorZ + 0.02);
    glass.raycast = () => {};
    root.add(glass);

    const seal = new THREE.Mesh(
      new THREE.TorusGeometry(doorRadius - 0.05, 0.02, 8, 24),
      sealMaterial,
    );
    seal.position.set(0, doorCenterY, doorZ);
    root.add(seal);
    addProxy(seal, 0.22);
    registerPart(
      seal,
      "seal",
      new THREE.Vector3(0, 0.5, 0.58),
      isWasher ? "washer-seal" : "dryer-seal",
    );

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.12, 0.03),
      metalMaterial,
    );
    handle.position.set(doorRadius * 0.72, doorCenterY, doorZ + 0.04);
    root.add(handle);

    const pump = createPump();
    pump.position.set(isWasher ? -0.28 : 0.26, 0.22, doorZ - 0.04);
    root.add(pump);
    registerPart(
      pump,
      "pump",
      new THREE.Vector3(isWasher ? 0.22 : -0.22, -0.16, 0.62),
      isWasher ? "washer-pump" : "dryer-pump",
    );

    const motor = isWasher ? createDrumMotor(1) : createBlower();
    motor.position.set(isWasher ? 0.16 : -0.16, MACHINE_FOOT + 0.46, -MACHINE_DEPTH / 2 + 0.02);
    root.add(motor);
    registerPart(
      motor,
      "motor",
      new THREE.Vector3(isWasher ? -0.28 : 0.28, 0.12, 1.02),
      isWasher ? "washer-motor" : "dryer-motor",
    );

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, 0.12, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x1b2431, roughness: 0.6 }),
    );
    panel.position.set(0, MACHINE_FOOT + MACHINE_HEIGHT - 0.16, doorZ);
    root.add(panel);

    const buttons = [];
    const buttonGeometry = new THREE.CylinderGeometry(0.026, 0.026, 0.02, 10);
    for (let index = 0; index < 3; index += 1) {
      const buttonMaterial = new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 0.25,
      });
      const button = new THREE.Mesh(buttonGeometry, buttonMaterial);
      button.rotation.x = Math.PI / 2;
      button.position.set(-0.14 + index * 0.14, MACHINE_FOOT + MACHINE_HEIGHT - 0.16, doorZ + 0.025);
      root.add(button);
      buttons.push(button);
    }

    if (isWasher) {
      const drawer = new THREE.Mesh(
        rounded(0.22, 0.08, 0.04, 0.012),
        new THREE.MeshStandardMaterial({ color: 0x243140, roughness: 0.6 }),
      );
      drawer.position.set(-0.28, MACHINE_FOOT + MACHINE_HEIGHT - 0.16, doorZ + 0.01);
      root.add(drawer);
    } else {
      const vent = new THREE.Group();
      for (let slatIndex = 0; slatIndex < 5; slatIndex += 1) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.016, 0.045), cabinetMaterial);
        slat.position.z = (slatIndex - 2) * 0.07;
        vent.add(slat);
      }
      vent.position.set(0, MACHINE_FOOT + MACHINE_HEIGHT + 0.02, 0.02);
      root.add(vent);
    }

    const anchor = new THREE.Object3D();
    anchor.position.set(0, 0.0, doorZ + 0.28);
    root.add(anchor);

    const glow = new THREE.PointLight(accent, 0, 2.2, 2);
    glow.position.set(0, doorCenterY, doorZ - 0.15);
    root.add(glow);

    let water = null;
    let waterDisc = null;
    if (isWasher) {
      water = createWaterDrops(doorRadius * 0.72);
      water.points.position.set(0, doorCenterY, doorZ + 0.055);
      root.add(water.points);
      waterDisc = new THREE.Mesh(
        new THREE.CircleGeometry(doorRadius * 0.7, 24),
        new THREE.MeshBasicMaterial({
          color: 0x1ec8ff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      waterDisc.position.set(0, doorCenterY, doorZ + 0.04);
      waterDisc.raycast = () => {};
      root.add(waterDisc);
    }

    const streaks = [];
    if (!isWasher) {
      for (let index = 0; index < AIR_STREAK_COUNT; index += 1) {
        const material = new THREE.MeshBasicMaterial({
          color: index % 2 === 0 ? 0xe6d9ff : 0xf4fbff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const streak = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.24, 0.02), material);
        streak.userData.phase = index / AIR_STREAK_COUNT;
        streak.userData.spin = index * 0.75;
        streak.raycast = () => {};
        streak.visible = false;
        root.add(streak);
        streaks.push(streak);
      }
    }

    scene.add(root);
    return {
      drum,
      ringMaterial,
      glow,
      anchor,
      buttons,
      water,
      waterDisc,
      streaks,
      doorCenterY,
      doorZ,
    };
  }

  function createHand() {
    const group = new THREE.Group();
    const palm = new THREE.Mesh(rounded(0.18, 0.07, 0.13, 0.02), handMaterial);
    group.add(palm);
    const fingers = [];
    for (let index = 0; index < 3; index += 1) {
      const pivot = new THREE.Group();
      pivot.position.set(-0.055 + index * 0.055, 0.03, 0.03);
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.032), handMaterial);
      finger.position.y = 0.055;
      pivot.add(finger);
      group.add(pivot);
      fingers.push(pivot);
    }
    const thumbPivot = new THREE.Group();
    thumbPivot.position.set(-0.09, 0, 0.02);
    thumbPivot.rotation.z = 0.7;
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.032), handMaterial);
    thumb.position.y = 0.04;
    thumbPivot.add(thumb);
    group.add(thumbPivot);
    fingers.push(thumbPivot);
    addProxy(group, 0.14);
    return { group, fingers };
  }

  function createArm() {
    const root = new THREE.Group();
    root.position.set(ARM_X, 0, 0);

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(1.08, 0.03, 0.86),
      new THREE.MeshStandardMaterial({
        color: ARM_ACCENT,
        emissive: ARM_ACCENT,
        emissiveIntensity: 0.5,
        roughness: 0.35,
      }),
    );
    plinth.position.y = 0.02;
    plinth.raycast = () => {};
    root.add(plinth);

    const mobility = new THREE.Group();
    const deck = new THREE.Mesh(rounded(0.84, 0.12, 0.5, 0.04), mobilityMaterial);
    mobility.add(deck);
    const wheelGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x222a36, roughness: 0.7 });
    for (const [wheelX, wheelZ] of [[-0.3, 0.16], [0.3, 0.16], [-0.3, -0.16], [0.3, -0.16]]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wheelX, -0.08, wheelZ);
      mobility.add(wheel);
    }
    mobility.position.y = 0.2;
    root.add(mobility);
    registerPart(mobility, "mobility", new THREE.Vector3(0.12, 0.04, 0.62), "arm-mobility");

    const mast = new THREE.Mesh(rounded(0.12, 1.16, 0.12, 0.03), armLinkMaterial);
    mast.position.set(-0.24, 0.26 + 0.58, -0.1);
    root.add(mast);

    const shoulder = new THREE.Group();
    shoulder.position.set(-0.24, 0.26 + 1.16, -0.1);
    shoulder.rotation.x = ARM_REST.shoulderX;
    shoulder.rotation.z = ARM_REST.shoulderZ;
    root.add(shoulder);

    const shoulderMotor = createDrumMotor(0.78);
    shoulder.add(shoulderMotor);
    registerPart(shoulderMotor, "motor", new THREE.Vector3(-0.22, 0.16, 0.32), "arm-shoulder-motor");

    const upperLength = 0.56;
    const upperArm = new THREE.Mesh(rounded(0.1, upperLength, 0.1, 0.03), armLinkMaterial);
    upperArm.position.y = upperLength / 2;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = upperLength;
    elbow.rotation.z = ARM_REST.elbowZ;
    shoulder.add(elbow);

    const elbowMotor = createDrumMotor(0.62);
    elbow.add(elbowMotor);
    registerPart(elbowMotor, "motor", new THREE.Vector3(0.18, 0.14, 0.28), "arm-elbow-motor");

    const foreLength = 0.46;
    const forearm = new THREE.Mesh(rounded(0.09, foreLength, 0.09, 0.025), armLinkMaterial);
    forearm.position.y = foreLength / 2;
    elbow.add(forearm);

    const hand = createHand();
    hand.group.position.y = foreLength;
    elbow.add(hand.group);
    registerPart(hand.group, "hand", new THREE.Vector3(0.1, 0.18, 0.36), "arm-hand");

    const table = new THREE.Mesh(rounded(0.52, 0.05, 0.36, 0.02), tableMaterial);
    table.position.set(0.14, 0.58, 0.24);
    root.add(table);

    const stack = new THREE.Group();
    stack.position.set(0.14, 0.61, 0.24);
    for (let layerIndex = 0; layerIndex < 3; layerIndex += 1) {
      const layer = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.022, 0.24), clothMaterial);
      layer.position.y = 0.02 + layerIndex * 0.028;
      layer.rotation.y = (layerIndex - 1) * 0.07;
      stack.add(layer);
    }
    const extraLayer = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.022, 0.24), clothMaterial);
    extraLayer.position.y = 0.02 + 3 * 0.028;
    extraLayer.visible = false;
    stack.add(extraLayer);
    root.add(stack);

    const foldedAnchor = new THREE.Object3D();
    foldedAnchor.position.set(0.14, 0.78, 0.42);
    root.add(foldedAnchor);

    const clothPivot = new THREE.Group();
    clothPivot.position.set(0.14 - 0.16, 0.74, 0.24);
    clothPivot.visible = false;
    const foldingCloth = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.012, 0.24), clothMaterial);
    foldingCloth.position.x = 0.16;
    clothPivot.add(foldingCloth);
    root.add(clothPivot);

    const anchor = new THREE.Object3D();
    anchor.position.set(0, 0, 0.7);
    root.add(anchor);

    scene.add(root);
    return {
      shoulder,
      elbow,
      fingers: hand.fingers,
      clothPivot,
      extraLayer,
      anchor,
      foldedAnchor,
    };
  }

  function createRoom() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 6),
      new THREE.MeshStandardMaterial({ color: 0x101826, roughness: 1, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);

    const grid = new THREE.GridHelper(7, 14, 0x1a2c40, 0x142033);
    grid.position.y = 0.004;
    grid.raycast = () => {};
    scene.add(grid);

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 3.6),
      new THREE.MeshStandardMaterial({ color: 0x121a28, roughness: 1 }),
    );
    wall.position.set(0, 1.7, -1.45);
    scene.add(wall);

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.035, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x8ea6c4 }),
    );
    strip.position.set(0, 2.7, -1.42);
    strip.raycast = () => {};
    scene.add(strip);

    scene.add(new THREE.AmbientLight(0xb7c6da, 0.72));
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(2.2, 4.4, 3.8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8eb4ff, 0.38);
    fill.position.set(-3.2, 2.2, 2);
    scene.add(fill);
  }

  createRoom();
  const washer = createFrontLoader("washer", WASHER_X);
  const dryer = createFrontLoader("dryer", DRYER_X);
  const arm = createArm();

  const anchors = {
    washer: washer.anchor,
    dryer: dryer.anchor,
    arm: arm.anchor,
    folded: arm.foldedAnchor,
  };

  let explodeAmount = 0;
  let selectedId = null;
  let elapsed = 0;
  let shownFold = 0;
  let currentShoulderX = ARM_REST.shoulderX;
  let currentShoulderZ = ARM_REST.shoulderZ;
  let currentElbowZ = ARM_REST.elbowZ;
  const projected = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  function applyExplode(target, deltaSeconds, reduceMotion) {
    const blend = reduceMotion ? 1 : Math.min(1, deltaSeconds * 5);
    explodeAmount += (target - explodeAmount) * blend;
    const eased = explodeAmount * explodeAmount * (3 - 2 * explodeAmount);
    for (const part of parts) {
      part.position.copy(part.userData.basePosition).addScaledVector(part.userData.explodeOffset, eased);
    }
  }

  function setHighlight(id) {
    if (id === selectedId) return;
    const previous = selectedId ? partsById.get(selectedId) : null;
    if (previous) paintPart(previous, false);
    selectedId = id;
    const next = id ? partsById.get(id) : null;
    if (next) paintPart(next, true);
  }

  function paintPart(part, active) {
    const color = new THREE.Color(SUPPLIERS[part.userData.category].color);
    part.scale.setScalar(part.userData.baseScale * (active ? SELECT_SCALE : 1));
    part.traverse((child) => {
      if (!child.isMesh || !child.material || !child.material.emissive || child.userData.pickProxy) return;
      if (active) {
        child.material.emissive.copy(color);
        child.material.emissiveIntensity = 0.95;
      } else if (child.userData.baseEmissive) {
        child.material.emissive.copy(child.userData.baseEmissive);
        child.material.emissiveIntensity = child.userData.baseEmissiveIntensity;
      }
    });
  }

  function updateWater(intensity) {
    const drops = washer.water;
    const visible = intensity > 0.04;
    drops.points.visible = visible;
    washer.waterDisc.material.opacity = intensity * 0.5;
    if (!visible) return;
    const positions = drops.positions;
    for (let index = 0; index < WATER_DROP_COUNT; index += 1) {
      const angle = drops.phases[index] + elapsed * (2.4 + (index % 3) * 0.35);
      const radius = drops.radii[index];
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = Math.sin(angle) * radius * 0.8;
      positions[index * 3 + 2] = Math.sin(angle * 2) * 0.015;
    }
    drops.geometry.attributes.position.needsUpdate = true;
    drops.material.opacity = 0.4 + intensity * 0.6;
  }

  function updateAir(intensity) {
    const visible = intensity > 0.04;
    for (let index = 0; index < dryer.streaks.length; index += 1) {
      const streak = dryer.streaks[index];
      streak.visible = visible;
      if (!visible) continue;
      const phase = (streak.userData.phase + elapsed * 0.5) % 1;
      if (index < dryer.streaks.length / 2) {
        const angle = streak.userData.spin + elapsed * 3.4;
        const radius = 0.1 + (index % 4) * 0.045;
        streak.position.set(
          Math.cos(angle) * radius,
          dryer.doorCenterY + Math.sin(angle) * radius * 0.75,
          dryer.doorZ + 0.09,
        );
        streak.rotation.z = angle;
      } else {
        const column = index - dryer.streaks.length / 2;
        streak.position.set(
          -0.12 + (column % 4) * 0.08,
          MACHINE_FOOT + MACHINE_HEIGHT + 0.14 + phase * 0.72,
          0.04,
        );
        streak.rotation.z = 0;
      }
      streak.material.opacity = intensity * (0.45 + (1 - phase) * 0.55);
    }
  }

  function updateArm(fold, deltaSeconds, reduceMotion) {
    const blend = reduceMotion ? 1 : Math.min(1, deltaSeconds * 5);
    shownFold += (fold - shownFold) * blend;
    const pose = poseAt(shownFold);
    currentShoulderX += (pose.shoulderX - currentShoulderX) * blend;
    currentShoulderZ += (pose.shoulderZ - currentShoulderZ) * blend;
    currentElbowZ += (pose.elbowZ - currentElbowZ) * blend;
    arm.shoulder.rotation.x = currentShoulderX;
    arm.shoulder.rotation.z = currentShoulderZ;
    arm.elbow.rotation.z = currentElbowZ;
    for (const finger of arm.fingers) {
      finger.rotation.x = -1.15 * shownFold;
    }
    arm.clothPivot.visible = shownFold > 0.03 && shownFold < 0.97;
    arm.clothPivot.rotation.z = -Math.PI * Math.min(shownFold, 1);
    arm.extraLayer.visible = shownFold >= 0.97;
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvas.parentElement ?? canvas);
  resize();

  function findPart(object) {
    let current = object;
    while (current) {
      if (current.userData && current.userData.id) return current;
      current = current.parent;
    }
    return null;
  }

  return {
    resize,
    getExplodeAmount() {
      return explodeAmount;
    },
    getView() {
      const offsetX = camera.position.x - controls.target.x;
      const offsetY = camera.position.y - controls.target.y;
      const offsetZ = camera.position.z - controls.target.z;
      const distance = Math.hypot(offsetX, offsetY, offsetZ);
      return {
        distance,
        azimuth: Math.atan2(offsetX, offsetZ),
      };
    },
    projectAnchor(name) {
      const anchor = anchors[name];
      anchor.getWorldPosition(projected);
      projected.project(camera);
      return {
        x: projected.x * 0.5 + 0.5,
        y: -projected.y * 0.5 + 0.5,
      };
    },
    screenPositionOf(id) {
      const part = partsById.get(id);
      if (!part) return null;
      scene.updateMatrixWorld(true);
      const center = new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3());
      center.project(camera);
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (center.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-center.y * 0.5 + 0.5) * rect.height,
      };
    },
    pick(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return { kind: "empty" };
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      scene.updateMatrixWorld(true);
      const hits = raycaster.intersectObjects(scene.children, true);
      if (hits.length === 0) return { kind: "empty" };
      const part = findPart(hits[0].object);
      if (!part) return { kind: "scenery" };
      return { kind: "part", id: part.userData.id, category: part.userData.category };
    },
    render(state, deltaSeconds) {
      elapsed += deltaSeconds;
      applyExplode(state.explodeTarget, deltaSeconds, state.reduceMotion);
      setHighlight(state.selectedId);
      const wash = state.wash;
      const dry = state.dry;
      washer.drum.rotation.y += deltaSeconds * wash * 7.5;
      dryer.drum.rotation.y += deltaSeconds * dry * 8;
      washer.glow.intensity = wash * 2.2;
      dryer.glow.intensity = dry * 2.2;
      washer.ringMaterial.emissiveIntensity = 0.55 + wash * 1.3;
      dryer.ringMaterial.emissiveIntensity = 0.55 + dry * 1.3;
      for (const button of washer.buttons) {
        button.material.emissiveIntensity = 0.2 + wash * (0.6 + 0.4 * Math.sin(elapsed * 8));
      }
      for (const button of dryer.buttons) {
        button.material.emissiveIntensity = 0.2 + dry * 0.9;
      }
      updateWater(wash);
      updateAir(dry);
      updateArm(state.fold, deltaSeconds, state.reduceMotion);
      controls.update();
      renderer.render(scene, camera);
    },
  };
}

export { EXPLODE_READY };
