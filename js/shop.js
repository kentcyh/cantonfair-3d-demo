import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { RoundedBoxGeometry } from "../vendor/RoundedBoxGeometry.js";
import { SUPPLIERS } from "./catalog.js";
import { GARMENT_HALF_WIDTH, LAYOUT } from "./layout.js";
import {
  GARMENT_COUNT,
  armPose,
  doorOpen,
  dryerSpinAngle,
  garmentSample,
  phaseFromTime,
  washerSpinAngle,
} from "./playback.js";

const MAX_PIXEL_RATIO = 1.65;
const EXPLODE_READY = 0.65;
const SELECT_SCALE = 1.14;
const DOOR_SWING = 1.18;

function rounded(width, height, depth, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2, depth / 2);
  if (safeRadius <= 0.001) return new THREE.BoxGeometry(width, height, depth);
  return new RoundedBoxGeometry(width, height, depth, 2, safeRadius);
}

function damp(current, target, lambda, deltaSeconds) {
  return current + (target - current) * (1 - Math.exp(-lambda * deltaSeconds));
}

function makeTileTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.fillStyle = "#1a222c";
  context.fillRect(0, 0, size, size);
  const tiles = 4;
  const tile = size / tiles;
  for (let row = 0; row < tiles; row += 1) {
    for (let column = 0; column < tiles; column += 1) {
      const shade = 26 + ((column + row) % 2) * 8 + ((column * 3 + row) % 3) * 3;
      context.fillStyle = `rgb(${shade + 10}, ${shade + 14}, ${shade + 20})`;
      context.fillRect(column * tile + 3, row * tile + 3, tile - 6, tile - 6);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 3);
  texture.anisotropy = 4;
  return texture;
}

function makeShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(32, 32, 4, 32, 32, 32);
  gradient.addColorStop(0, "rgba(0,0,0,0.55)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createEnvironment(renderer) {
  const envScene = new THREE.Scene();
  envScene.add(new THREE.HemisphereLight(0xe7eef8, 0x6a5c50, 0.8));
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x8ea0b8, side: THREE.BackSide }),
  );
  room.scale.set(12, 8, 12);
  envScene.add(room);
  const windowPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 2.4),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  windowPanel.position.set(3.2, 3.4, 4);
  envScene.add(windowPanel);
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(envScene, 0.02);
  generator.dispose();
  return target.texture;
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
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x101722, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101722);
  try {
    scene.environment = createEnvironment(renderer);
    scene.environmentIntensity = 0.72;
  } catch (error) {
    console.warn(error);
  }

  const camera = new THREE.PerspectiveCamera(33, 1, 0.08, 40);
  camera.position.set(0.1, 1.42, 7.35);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0.06, 0.86, 0.08);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.enablePan = false;
  controls.rotateSpeed = 0.42;
  controls.zoomSpeed = 0.6;
  controls.minDistance = 5.9;
  controls.maxDistance = 10.4;
  controls.minPolarAngle = Math.PI / 2 - 0.46;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minAzimuthAngle = -0.5;
  controls.maxAzimuthAngle = 0.5;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY;
  controls.update();

  const parts = [];
  const partsById = new Map();
  const proxyMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });

  function addProxy(object, radius) {
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), proxyMaterial);
    proxy.userData.pickProxy = true;
    proxy.castShadow = false;
    proxy.receiveShadow = false;
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

  const enamel = new THREE.MeshStandardMaterial({
    color: 0xf4f7fb,
    roughness: 0.32,
    metalness: 0.06,
    envMapIntensity: 0.55,
  });
  const enamelDryer = new THREE.MeshStandardMaterial({
    color: 0xe7edf3,
    roughness: 0.34,
    metalness: 0.08,
    envMapIntensity: 0.55,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0xc5ced6,
    roughness: 0.28,
    metalness: 0.82,
    envMapIntensity: 1,
  });
  const darkPlastic = new THREE.MeshStandardMaterial({
    color: 0x1b242f,
    roughness: 0.62,
    metalness: 0.08,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x161b22,
    roughness: 0.9,
    metalness: 0,
  });
  const pumpMaterial = new THREE.MeshStandardMaterial({
    color: 0x2c88aa,
    roughness: 0.34,
    metalness: 0.62,
    emissive: 0x083040,
    emissiveIntensity: 0.35,
    envMapIntensity: 0.8,
  });
  const sealMaterial = new THREE.MeshStandardMaterial({
    color: 0x1c4a38,
    roughness: 0.84,
    metalness: 0.02,
    emissive: 0x06281c,
    emissiveIntensity: 0.25,
  });
  const motorMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4843c,
    roughness: 0.4,
    metalness: 0.48,
    emissive: 0x4a2810,
    emissiveIntensity: 0.28,
  });
  const handMaterial = new THREE.MeshStandardMaterial({
    color: 0xe07a98,
    roughness: 0.48,
    metalness: 0.12,
    emissive: 0x5a2438,
    emissiveIntensity: 0.22,
  });
  const mobilityMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a2d5c,
    roughness: 0.48,
    metalness: 0.28,
    emissive: 0x241848,
    emissiveIntensity: 0.28,
  });
  const linkMaterial = new THREE.MeshStandardMaterial({
    color: 0xd5dde6,
    roughness: 0.38,
    metalness: 0.22,
    envMapIntensity: 0.6,
  });
  const jointMaterial = new THREE.MeshStandardMaterial({
    color: 0x3cba9a,
    roughness: 0.4,
    metalness: 0.18,
    emissive: 0x145041,
    emissiveIntensity: 0.2,
  });
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d6a45,
    roughness: 0.72,
    metalness: 0.04,
  });
  const basketMaterial = new THREE.MeshStandardMaterial({
    color: 0x3e74c4,
    roughness: 0.55,
    metalness: 0.08,
  });
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a2330,
    roughness: 0.92,
    metalness: 0,
  });
  const counterMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a3544,
    roughness: 0.6,
    metalness: 0.12,
  });

  function contactShadow(width, depth) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.008;
    mesh.raycast = () => {};
    return mesh;
  }

  const shadowTexture = makeShadowTexture();
  const tileTexture = makeTileTexture();

  function createRoom() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8.5, 6.5),
      new THREE.MeshStandardMaterial({
        map: tileTexture,
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.04,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 1.7),
      new THREE.MeshStandardMaterial({ color: 0x232b36, roughness: 0.96, metalness: 0 }),
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(0.05, 0.004, 0.28);
    mat.receiveShadow = true;
    scene.add(mat);

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 3.4), wallMaterial);
    wall.position.set(0, 1.55, -1.28);
    wall.receiveShadow = true;
    scene.add(wall);

    const side = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.4), wallMaterial);
    side.position.set(-2.7, 1.55, 0.2);
    side.rotation.y = Math.PI / 2;
    scene.add(side);

    const baseboard = new THREE.Mesh(
      new THREE.BoxGeometry(8.2, 0.08, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x0e141c, roughness: 0.8 }),
    );
    baseboard.position.set(0, 0.04, -1.25);
    scene.add(baseboard);

    const backsplash = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x314155, roughness: 0.55, metalness: 0.08 }),
    );
    backsplash.position.set(0.05, 1.28, -1.26);
    scene.add(backsplash);

    const windowGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.7),
      new THREE.MeshStandardMaterial({
        color: 0xd5e4f4,
        emissive: 0x9eb6d0,
        emissiveIntensity: 0.35,
        roughness: 0.4,
      }),
    );
    windowGlow.position.set(-1.7, 2.15, -1.26);
    windowGlow.raycast = () => {};
    scene.add(windowGlow);

    const counter = new THREE.Mesh(rounded(4.3, 0.78, 0.34, 0.02), counterMaterial);
    counter.position.set(0.05, 0.39, -0.86);
    counter.castShadow = true;
    counter.receiveShadow = true;
    scene.add(counter);

    const counterTop = new THREE.Mesh(
      new THREE.BoxGeometry(4.36, 0.04, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x9aa6b2, roughness: 0.28, metalness: 0.35 }),
    );
    counterTop.position.set(0.05, 0.8, -0.84);
    counterTop.castShadow = true;
    scene.add(counterTop);

    const bottleColors = [0x3ec6ff, 0xf0a020, 0x3ddc97, 0xd7e2ee];
    for (let index = 0; index < bottleColors.length; index += 1) {
      const bottle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.05, 0.2, 10),
        new THREE.MeshStandardMaterial({
          color: bottleColors[index],
          roughness: 0.35,
          metalness: 0.05,
        }),
      );
      bottle.position.set(-1.15 + index * 0.16, 0.92, -0.86);
      bottle.castShadow = true;
      scene.add(bottle);
    }

    const lightBar = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.04, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0xf7f1e4,
        emissive: 0xfff4e0,
        emissiveIntensity: 0.55,
        roughness: 0.4,
      }),
    );
    lightBar.position.set(0.2, 2.35, -0.4);
    lightBar.raycast = () => {};
    scene.add(lightBar);

    const hemi = new THREE.HemisphereLight(0xd5e2f4, 0x3a332c, 0.62);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff6ec, 2.6);
    key.position.set(2.6, 5.4, 3.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.6;
    key.shadow.camera.far = 14;
    key.shadow.camera.left = -3.4;
    key.shadow.camera.right = 3.4;
    key.shadow.camera.top = 3.2;
    key.shadow.camera.bottom = -1.6;
    key.shadow.bias = -0.00035;
    key.shadow.normalBias = 0.028;
    key.shadow.radius = 2.5;
    scene.add(key);
    scene.add(key.target);
    key.target.position.set(0.1, 0.7, 0);
    const fill = new THREE.DirectionalLight(0x9eb6d6, 0.85);
    fill.position.set(-3.4, 2.6, 2.4);
    scene.add(fill);
  }

  function createPump() {
    const group = new THREE.Group();
    const housing = new THREE.Mesh(rounded(0.22, 0.12, 0.16, 0.03), pumpMaterial);
    housing.castShadow = true;
    group.add(housing);
    const volute = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 14), pumpMaterial);
    volute.rotation.x = Math.PI / 2;
    volute.position.z = 0.09;
    group.add(volute);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 8), pumpMaterial);
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(0.14, 0.02, 0);
    group.add(nozzle);
    addProxy(group, 0.24);
    return group;
  }

  function createDrumMotor(uniformScale) {
    const group = new THREE.Group();
    group.scale.setScalar(uniformScale);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 16), motorMaterial);
    can.rotation.x = Math.PI / 2;
    can.castShadow = true;
    group.add(can);
    for (let index = 0; index < 6; index += 1) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.028), motorMaterial);
      const angle = (index / 6) * Math.PI * 2;
      fin.position.set(Math.cos(angle) * 0.1, Math.sin(angle) * 0.1, 0);
      group.add(fin);
    }
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), steel);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.12;
    group.add(shaft);
    addProxy(group, 0.2);
    return group;
  }

  function createFrontLoader(kind, xPosition) {
    const isWasher = kind === "washer";
    const accent = isWasher ? 0x3ecbff : 0xb388ff;
    const root = new THREE.Group();
    root.position.set(xPosition, 0, 0);

    const body = new THREE.Mesh(
      rounded(LAYOUT.machineW, LAYOUT.machineH, LAYOUT.machineD, 0.08),
      isWasher ? enamel : enamelDryer,
    );
    body.position.y = LAYOUT.foot + LAYOUT.machineH / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    root.add(body);

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(LAYOUT.machineW + 0.04, 0.025, LAYOUT.machineD + 0.04),
      new THREE.MeshStandardMaterial({ color: 0x121820, roughness: 0.7, metalness: 0.2 }),
    );
    plinth.position.y = 0.012;
    root.add(plinth);

    const footGeometry = new THREE.CylinderGeometry(0.045, 0.05, LAYOUT.foot, 10);
    const footX = LAYOUT.machineW / 2 - 0.12;
    const footZ = LAYOUT.machineD / 2 - 0.12;
    for (const signX of [-1, 1]) {
      for (const signZ of [-1, 1]) {
        const foot = new THREE.Mesh(footGeometry, rubber);
        foot.position.set(signX * footX, LAYOUT.foot / 2, signZ * footZ);
        foot.castShadow = true;
        root.add(foot);
      }
    }

    const doorRadius = LAYOUT.doorRadius;
    const cavity = new THREE.Mesh(
      new THREE.CircleGeometry(doorRadius - 0.02, 28),
      new THREE.MeshStandardMaterial({ color: 0x10161e, roughness: 0.72, metalness: 0.12 }),
    );
    cavity.position.set(0, LAYOUT.doorY, LAYOUT.doorZ - 0.1);
    root.add(cavity);

    const spinner = new THREE.Group();
    spinner.rotation.x = Math.PI / 2;
    spinner.position.set(0, LAYOUT.doorY, LAYOUT.doorZ - 0.055);
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(doorRadius - 0.07, doorRadius - 0.07, 0.045, 28),
      steel,
    );
    drum.castShadow = true;
    const holeMaterial = new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.55, metalness: 0.35 });
    for (let index = 0; index < 10; index += 1) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 8), holeMaterial);
      const angle = (index / 10) * Math.PI * 2;
      const holeRadius = doorRadius * 0.42;
      hole.position.set(Math.cos(angle) * holeRadius, 0.02, Math.sin(angle) * holeRadius);
      drum.add(hole);
    }
    for (let index = 0; index < 3; index += 1) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.1), steel);
      const angle = (index / 3) * Math.PI * 2;
      rib.position.set(Math.cos(angle) * doorRadius * 0.48, 0.01, Math.sin(angle) * doorRadius * 0.48);
      rib.rotation.y = -angle;
      drum.add(rib);
    }
    spinner.add(drum);
    root.add(spinner);

    const doorPivot = new THREE.Group();
    doorPivot.position.set(-0.26, LAYOUT.doorY, LAYOUT.doorZ);
    doorPivot.userData.operableId = isWasher ? "washer-door" : "dryer-door";
    root.add(doorPivot);

    const doorCenterX = 0.26;
    const bezel = new THREE.Mesh(
      new THREE.TorusGeometry(doorRadius, 0.028, 10, 36),
      new THREE.MeshStandardMaterial({
        color: 0xd5dee6,
        roughness: 0.22,
        metalness: 0.78,
        envMapIntensity: 1,
      }),
    );
    bezel.position.set(doorCenterX, 0, 0.012);
    bezel.castShadow = true;
    doorPivot.add(bezel);

    const ringMaterial = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 0.18,
      roughness: 0.32,
      metalness: 0.24,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(doorRadius + 0.012, 0.012, 8, 36), ringMaterial);
    ring.position.set(doorCenterX, 0, 0.02);
    doorPivot.add(ring);

    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(doorRadius - 0.04, 32),
      new THREE.MeshStandardMaterial({
        color: isWasher ? 0xc5e8f6 : 0xddd4f4,
        roughness: 0.08,
        metalness: 0.04,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        envMapIntensity: 0.8,
      }),
    );
    glass.position.set(doorCenterX, 0, 0.02);
    glass.raycast = () => {};
    doorPivot.add(glass);

    const pickPad = new THREE.Mesh(new THREE.CircleGeometry(doorRadius + 0.08, 20), proxyMaterial);
    pickPad.position.set(doorCenterX, 0, 0.04);
    pickPad.userData.pickProxy = true;
    doorPivot.add(pickPad);

    const handle = new THREE.Mesh(rounded(0.035, 0.14, 0.03, 0.012), steel);
    handle.position.set(doorCenterX + doorRadius * 0.62, 0, 0.05);
    handle.castShadow = true;
    doorPivot.add(handle);

    const seal = new THREE.Mesh(new THREE.TorusGeometry(doorRadius - 0.045, 0.022, 8, 28), sealMaterial);
    seal.position.set(doorCenterX, 0, -0.01);
    doorPivot.add(seal);
    addProxy(seal, 0.3);
    registerPart(
      seal,
      "seal",
      new THREE.Vector3(isWasher ? 0.12 : -0.06, 0.2, 0.5),
      isWasher ? "washer-seal" : "dryer-seal",
    );

    const pump = createPump();
    pump.position.set(isWasher ? -0.28 : 0.28, 0.28, LAYOUT.doorZ - 0.02);
    root.add(pump);
    registerPart(
      pump,
      "pump",
      new THREE.Vector3(isWasher ? 0.08 : -0.16, -0.02, 0.62),
      isWasher ? "washer-pump" : "dryer-pump",
    );

    const motor = createDrumMotor(isWasher ? 1 : 0.92);
    motor.position.set(isWasher ? 0.22 : -0.22, 0.34, LAYOUT.doorZ - 0.08);
    root.add(motor);
    registerPart(
      motor,
      "motor",
      new THREE.Vector3(isWasher ? 0.18 : -0.14, 0.06, 0.58),
      isWasher ? "washer-motor" : "dryer-motor",
    );

    const panel = new THREE.Mesh(rounded(0.78, 0.16, 0.04, 0.02), darkPlastic);
    panel.position.set(0, LAYOUT.foot + LAYOUT.machineH - 0.18, LAYOUT.doorZ);
    panel.castShadow = true;
    root.add(panel);

    const dial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.03, 16),
      new THREE.MeshStandardMaterial({ color: 0xd5dde6, roughness: 0.35, metalness: 0.4 }),
    );
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0.22, LAYOUT.foot + LAYOUT.machineH - 0.18, LAYOUT.doorZ + 0.03);
    root.add(dial);
    const dialMark = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.028, 0.012),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.4 }),
    );
    dialMark.position.set(0, 0.02, 0.012);
    dial.add(dialMark);

    const buttons = [];
    for (let index = 0; index < 2; index += 1) {
      const button = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.018, 10),
        new THREE.MeshStandardMaterial({
          color: accent,
          emissive: accent,
          emissiveIntensity: 0.25,
          roughness: 0.4,
        }),
      );
      button.rotation.x = Math.PI / 2;
      button.position.set(-0.22 + index * 0.1, LAYOUT.foot + LAYOUT.machineH - 0.18, LAYOUT.doorZ + 0.03);
      root.add(button);
      buttons.push(button);
    }

    if (isWasher) {
      const drawer = new THREE.Mesh(rounded(0.2, 0.07, 0.035, 0.01), darkPlastic);
      drawer.position.set(-0.32, LAYOUT.foot + LAYOUT.machineH - 0.18, LAYOUT.doorZ + 0.02);
      root.add(drawer);
    } else {
      const vent = new THREE.Group();
      for (let slatIndex = 0; slatIndex < 4; slatIndex += 1) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.012, 0.04), enamelDryer);
        slat.position.z = (slatIndex - 1.5) * 0.06;
        vent.add(slat);
      }
      vent.position.set(0, LAYOUT.foot + LAYOUT.machineH + 0.02, 0);
      root.add(vent);
    }

    const glow = new THREE.PointLight(accent, 0.05, 1.6, 2);
    glow.position.set(0, LAYOUT.doorY, LAYOUT.doorZ - 0.12);
    root.add(glow);

    const anchor = new THREE.Object3D();
    anchor.position.set(0, 0.16, LAYOUT.doorZ + 0.42);
    root.add(anchor);

    const shadow = contactShadow(1.25, 0.9);
    shadow.position.x = xPosition;
    scene.add(shadow);

    scene.add(root);
    return { root, drum, doorPivot, ringMaterial, glow, anchor, dial, buttons };
  }

  function createGarment(kind, color, stripe) {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.94,
      metalness: 0,
      envMapIntensity: 0.18,
    });
    const root = new THREE.Group();
    const hinge = new THREE.Group();
    root.add(hinge);
    root.userData.hinge = hinge;
    const thick = 0.018;
    const depth = kind === "towel" ? 0.26 : kind === "tee" ? 0.24 : 0.3;
    const panel = GARMENT_HALF_WIDTH * 2;
    const left = new THREE.Mesh(rounded(panel, thick, depth, 0.012), material);
    left.position.set(-GARMENT_HALF_WIDTH, 0, 0);
    left.castShadow = true;
    left.receiveShadow = true;
    root.add(left);
    const right = new THREE.Mesh(rounded(panel, thick, depth, 0.012), material);
    right.position.set(GARMENT_HALF_WIDTH, 0, 0);
    right.castShadow = true;
    right.receiveShadow = true;
    hinge.add(right);

    if (kind !== "towel") {
      const sleeveMaterial = material;
      const sleeveL = new THREE.Mesh(rounded(0.1, thick, 0.07, 0.01), sleeveMaterial);
      sleeveL.position.set(-panel + 0.02, 0, -depth * 0.28);
      sleeveL.castShadow = true;
      root.add(sleeveL);
      const sleeveR = new THREE.Mesh(rounded(0.1, thick, 0.07, 0.01), sleeveMaterial);
      sleeveR.position.set(panel - 0.02, 0, -depth * 0.28);
      sleeveR.castShadow = true;
      hinge.add(sleeveR);
      const collar = new THREE.Mesh(
        rounded(0.1, thick * 1.4, 0.045, 0.008),
        new THREE.MeshStandardMaterial({ color: stripe, roughness: 0.9, metalness: 0 }),
      );
      collar.position.set(0, 0.004, -depth / 2 + 0.02);
      collar.castShadow = true;
      root.add(collar);
    } else {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(panel * 0.72, thick * 1.4, depth * 0.5),
        new THREE.MeshStandardMaterial({ color: stripe, roughness: 0.9, metalness: 0 }),
      );
      band.position.set(-GARMENT_HALF_WIDTH, 0.003, 0);
      root.add(band);
    }
    root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return root;
  }

  function createHand() {
    const group = new THREE.Group();
    group.userData.operableId = "gripper";
    const palm = new THREE.Mesh(rounded(0.16, 0.045, 0.11, 0.016), handMaterial);
    palm.castShadow = true;
    group.add(palm);
    const fingers = [];
    for (let index = 0; index < 2; index += 1) {
      const pivot = new THREE.Group();
      pivot.position.set(-0.04 + index * 0.08, 0.02, 0.045);
      const finger = new THREE.Mesh(rounded(0.03, 0.11, 0.028, 0.01), handMaterial);
      finger.position.y = 0.055;
      finger.castShadow = true;
      pivot.add(finger);
      group.add(pivot);
      fingers.push(pivot);
    }
    const thumbPivot = new THREE.Group();
    thumbPivot.position.set(-0.085, 0.005, 0.01);
    thumbPivot.rotation.z = 0.55;
    const thumb = new THREE.Mesh(rounded(0.028, 0.08, 0.026, 0.01), handMaterial);
    thumb.position.y = 0.04;
    thumb.castShadow = true;
    thumbPivot.add(thumb);
    group.add(thumbPivot);
    fingers.push(thumbPivot);
    addProxy(group, 0.2);
    return { group, fingers };
  }

  function createArm() {
    const root = new THREE.Group();
    root.position.set(LAYOUT.armX, 0, 0);

    const shadow = contactShadow(1.15, 0.85);
    shadow.position.set(LAYOUT.armX, 0.008, 0.05);
    scene.add(shadow);

    const mobility = new THREE.Group();
    const deck = new THREE.Mesh(rounded(0.78, 0.1, 0.48, 0.04), mobilityMaterial);
    deck.castShadow = true;
    deck.receiveShadow = true;
    mobility.add(deck);
    const skirt = new THREE.Mesh(
      rounded(0.84, 0.04, 0.54, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x241c38, roughness: 0.6, metalness: 0.2 }),
    );
    skirt.position.y = -0.02;
    mobility.add(skirt);
    const wheelGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12);
    for (const [wheelX, wheelZ] of [[-0.28, 0.16], [0.28, 0.16], [-0.28, -0.16], [0.28, -0.16]]) {
      const wheel = new THREE.Mesh(wheelGeometry, rubber);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wheelX, -0.08, wheelZ);
      wheel.castShadow = true;
      mobility.add(wheel);
    }
    mobility.position.y = 0.2;
    root.add(mobility);
    registerPart(mobility, "mobility", new THREE.Vector3(-0.08, 0.04, 0.48), "arm-mobility");

    const mast = new THREE.Mesh(rounded(0.1, 1.02, 0.1, 0.03), linkMaterial);
    mast.position.set(-0.08, 0.72, -0.02);
    mast.castShadow = true;
    root.add(mast);

    const shoulder = new THREE.Group();
    shoulder.position.set(-0.02, 1.2, 0.04);
    root.add(shoulder);

    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), jointMaterial);
    shoulderCap.castShadow = true;
    shoulder.add(shoulderCap);

    const shoulderMotor = createDrumMotor(0.7);
    shoulderMotor.position.set(0, 0, -0.02);
    shoulder.add(shoulderMotor);
    registerPart(shoulderMotor, "motor", new THREE.Vector3(-0.16, 0.12, 0.28), "arm-shoulder-motor");

    const upperLength = 0.5;
    const upperArm = new THREE.Mesh(rounded(0.08, upperLength, 0.08, 0.028), linkMaterial);
    upperArm.position.y = upperLength / 2;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = upperLength;
    shoulder.add(elbow);
    const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), jointMaterial);
    elbowCap.castShadow = true;
    elbow.add(elbowCap);

    const elbowMotor = createDrumMotor(0.55);
    elbow.add(elbowMotor);
    registerPart(elbowMotor, "motor", new THREE.Vector3(-0.02, 0.08, 0.16), "arm-elbow-motor");

    const foreLength = 0.44;
    const forearm = new THREE.Mesh(rounded(0.07, foreLength, 0.07, 0.024), linkMaterial);
    forearm.position.y = foreLength / 2;
    forearm.castShadow = true;
    elbow.add(forearm);

    const hand = createHand();
    hand.group.position.y = foreLength;
    elbow.add(hand.group);
    registerPart(hand.group, "hand", new THREE.Vector3(-0.06, 0.06, 0.18), "arm-hand");

    const anchor = new THREE.Object3D();
    anchor.position.set(0.02, 0.2, 0.62);
    root.add(anchor);

    scene.add(root);
    return { shoulder, elbow, fingers: hand.fingers, anchor, hand: hand.group };
  }

  function createTable() {
    const group = new THREE.Group();
    const top = new THREE.Mesh(rounded(0.62, 0.04, 0.5, 0.015), woodMaterial);
    top.position.set(LAYOUT.foldSpot.x, 0.64, 0.38);
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);
    const legGeometry = new THREE.BoxGeometry(0.04, 0.62, 0.04);
    for (const [legX, legZ] of [[-0.26, -0.2], [0.26, -0.2], [-0.26, 0.2], [0.26, 0.2]]) {
      const leg = new THREE.Mesh(legGeometry, darkPlastic);
      leg.position.set(LAYOUT.foldSpot.x + legX, 0.31, 0.38 + legZ);
      leg.castShadow = true;
      group.add(leg);
    }
    const shadow = contactShadow(0.7, 0.55);
    shadow.position.set(LAYOUT.foldSpot.x, 0.008, 0.38);
    scene.add(shadow);
    scene.add(group);
  }

  function createBasket() {
    const group = new THREE.Group();
    group.position.set(LAYOUT.basket.x, 0, LAYOUT.basket.z);
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.04, 16), basketMaterial);
    bottom.position.y = 0.03;
    bottom.castShadow = true;
    bottom.receiveShadow = true;
    group.add(bottom);
    for (let index = 0; index < 12; index += 1) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.012), basketMaterial);
      const angle = (index / 12) * Math.PI * 2;
      slat.position.set(Math.cos(angle) * 0.19, 0.12, Math.sin(angle) * 0.19);
      slat.rotation.y = angle;
      slat.castShadow = true;
      group.add(slat);
    }
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 8, 20), basketMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.22;
    rim.castShadow = true;
    group.add(rim);
    scene.add(group);
    const shadow = contactShadow(0.55, 0.55);
    shadow.position.set(LAYOUT.basket.x, 0.008, LAYOUT.basket.z);
    scene.add(shadow);
  }

  function createEffects() {
    const waterMaterial = new THREE.MeshBasicMaterial({
      color: 0x67c6ea,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const waterDisc = new THREE.Mesh(new THREE.CircleGeometry(0.26, 28), waterMaterial.clone());
    waterDisc.position.set(LAYOUT.washerX, LAYOUT.doorY, LAYOUT.doorZ + 0.01);
    waterDisc.raycast = () => {};
    scene.add(waterDisc);

    const drops = new THREE.Group();
    drops.position.set(LAYOUT.washerX, LAYOUT.doorY, LAYOUT.doorZ - 0.01);
    const dropGeometry = new THREE.SphereGeometry(0.018, 8, 6);
    const dropMeshes = [];
    for (let index = 0; index < 10; index += 1) {
      const drop = new THREE.Mesh(dropGeometry, waterMaterial);
      drop.userData.angle = (index / 10) * Math.PI * 2;
      drop.userData.radius = 0.08 + (index % 3) * 0.035;
      drop.raycast = () => {};
      drops.add(drop);
      dropMeshes.push(drop);
    }
    scene.add(drops);

    const airMaterial = new THREE.MeshBasicMaterial({
      color: 0xc9d4e6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const streaks = [];
    for (let index = 0; index < 8; index += 1) {
      const material = airMaterial.clone();
      const streak = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.012), material);
      streak.userData.phase = index / 8;
      streak.userData.column = index;
      streak.raycast = () => {};
      scene.add(streak);
      streaks.push(streak);
    }
    return { waterMaterial, waterDisc, dropMeshes, streaks };
  }

  createRoom();
  const washer = createFrontLoader("washer", LAYOUT.washerX);
  const dryer = createFrontLoader("dryer", LAYOUT.dryerX);
  const arm = createArm();
  createTable();
  createBasket();
  const effects = createEffects();

  const garments = [
    createGarment("shirt", 0x2c6cb5, 0x1e4e86),
    createGarment("towel", 0xf3efe4, 0xd9c7a4),
    createGarment("tee", 0xe36d62, 0xb85048),
  ];
  for (const garment of garments) scene.add(garment);

  const foldedAnchor = new THREE.Object3D();
  foldedAnchor.position.set(LAYOUT.stack.x, LAYOUT.stack.y + 0.34, LAYOUT.stack.z + 0.2);
  scene.add(foldedAnchor);

  const anchors = {
    washer: washer.anchor,
    dryer: dryer.anchor,
    arm: arm.anchor,
    folded: foldedAnchor,
  };

  let explodeAmount = 0;
  let renderErrorLogged = false;
  let selectedId = null;
  let elapsed = 0;
  let playTime = 0;
  let manualWasher = 0;
  let manualDryer = 0;
  let shownWasher = 0;
  let shownDryer = 0;
  let gestureUntil = 0;
  const projected = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  function applyExplode(target, deltaSeconds, reduceMotion) {
    if (reduceMotion) explodeAmount = target;
    else explodeAmount = damp(explodeAmount, target, 5.2, deltaSeconds);
    const eased = explodeAmount * explodeAmount * (3 - 2 * explodeAmount);
    for (const part of parts) {
      part.position.copy(part.userData.basePosition).addScaledVector(part.userData.explodeOffset, eased);
    }
  }

  function paintPart(part, active) {
    const color = new THREE.Color(SUPPLIERS[part.userData.category].color);
    part.scale.setScalar(part.userData.baseScale * (active ? SELECT_SCALE : 1));
    part.traverse((child) => {
      if (!child.isMesh || !child.material || !child.material.emissive || child.userData.pickProxy) return;
      if (active) {
        child.material.emissive.copy(color);
        child.material.emissiveIntensity = 0.7;
      } else if (child.userData.baseEmissive) {
        child.material.emissive.copy(child.userData.baseEmissive);
        child.material.emissiveIntensity = child.userData.baseEmissiveIntensity;
      }
    });
  }

  function setHighlight(id) {
    if (id === selectedId) return;
    const previous = selectedId ? partsById.get(selectedId) : null;
    if (previous) paintPart(previous, false);
    selectedId = id;
    const next = id ? partsById.get(id) : null;
    if (next) paintPart(next, true);
  }

  function placeGarments(time) {
    for (let index = 0; index < GARMENT_COUNT; index += 1) {
      const sample = garmentSample(time, index);
      const garment = garments[index];
      garment.position.set(sample.x, sample.y, sample.z);
      garment.rotation.set(sample.rotX, sample.rotY, sample.rotZ);
      garment.userData.hinge.rotation.z = sample.fold * Math.PI;
      garment.visible = true;
    }
  }

  function updateCycle(time) {
    const washAngle = washerSpinAngle(time);
    const dryAngle = dryerSpinAngle(time);
    washer.drum.rotation.y = washAngle;
    dryer.drum.rotation.y = dryAngle;
    washer.dial.rotation.z = washAngle;
    dryer.dial.rotation.z = dryAngle;

    const timedDoors = doorOpen(time);
    const phase = phaseFromTime(time);
    washer.glow.intensity = 0.04 + phase.washIntensity * 0.7;
    dryer.glow.intensity = 0.04 + phase.dryIntensity * 0.55;
    washer.ringMaterial.emissiveIntensity = 0.16 + phase.washIntensity * 0.45;
    dryer.ringMaterial.emissiveIntensity = 0.16 + phase.dryIntensity * 0.4;
    for (const button of washer.buttons) {
      button.material.emissiveIntensity = 0.22 + phase.washIntensity * 0.45;
    }
    for (const button of dryer.buttons) {
      button.material.emissiveIntensity = 0.22 + phase.dryIntensity * 0.4;
    }

    effects.waterMaterial.opacity = phase.washIntensity * 0.42;
    effects.waterDisc.material.opacity = phase.washIntensity * 0.28;
    for (const drop of effects.dropMeshes) {
      const angle = drop.userData.angle + washAngle * 2 + elapsed * phase.washIntensity;
      drop.position.set(Math.cos(angle) * drop.userData.radius, Math.sin(angle) * drop.userData.radius, 0);
    }

    for (const streak of effects.streaks) {
      const column = streak.userData.column;
      const rise = (streak.userData.phase + time * 0.28) % 1;
      if (column < 5) {
        const angle = streak.userData.phase * Math.PI * 2 + dryAngle;
        const radius = 0.12 + (column % 3) * 0.04;
        streak.position.set(
          LAYOUT.dryerX + Math.cos(angle) * radius,
          LAYOUT.doorY + Math.sin(angle) * radius * 0.85,
          LAYOUT.doorZ + 0.03,
        );
        streak.material.opacity = phase.dryIntensity * 0.28 * (1 - rise * 0.4);
      } else {
        streak.position.set(
          LAYOUT.dryerX - 0.12 + (column - 5) * 0.12,
          LAYOUT.foot + LAYOUT.machineH + 0.08 + rise * 0.45,
          0.02,
        );
        streak.material.opacity = phase.dryIntensity * (1 - rise) * 0.35;
      }
    }

    return timedDoors;
  }

  function updateArm(time) {
    const pose = armPose(time);
    arm.shoulder.rotation.x = pose.shoulderX;
    arm.shoulder.rotation.z = pose.shoulderZ;
    arm.elbow.rotation.z = pose.elbowZ;
    let grip = pose.grip;
    if (playTime <= 0.02 && elapsed < gestureUntil) {
      const wave = Math.sin(((gestureUntil - elapsed) / 1.15) * Math.PI * 2);
      arm.elbow.rotation.z += wave * 0.28;
      grip = Math.max(grip, Math.abs(wave));
    }
    for (const finger of arm.fingers) {
      finger.rotation.x = -0.2 - grip * 1.05;
    }
  }

  function updateDoors(timedDoors, deltaSeconds, reduceMotion) {
    const manual = playTime <= 0.02;
    const targetWasher = manual ? manualWasher : timedDoors.washer;
    const targetDryer = manual ? manualDryer : timedDoors.dryer;
    if (reduceMotion) {
      shownWasher = targetWasher;
      shownDryer = targetDryer;
    } else {
      shownWasher = damp(shownWasher, targetWasher, 9, deltaSeconds);
      shownDryer = damp(shownDryer, targetDryer, 9, deltaSeconds);
    }
    washer.doorPivot.rotation.y = -shownWasher * DOOR_SWING;
    dryer.doorPivot.rotation.y = -shownDryer * DOOR_SWING;
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

  function classify(object) {
    let part = null;
    let operable = null;
    let current = object;
    while (current) {
      if (!part && current.userData && current.userData.id) part = current;
      if (!operable && current.userData && current.userData.operableId) operable = current;
      current = current.parent;
    }
    return { part, operable };
  }

  return {
    resize,
    activate(id) {
      if (playTime > 0.02) return;
      if (id === "washer-door") manualWasher = manualWasher > 0.5 ? 0 : 1;
      else if (id === "dryer-door") manualDryer = manualDryer > 0.5 ? 0 : 1;
      else if (id === "gripper") gestureUntil = elapsed + 1.15;
    },
    getExplodeAmount() {
      return explodeAmount;
    },
    getView() {
      const offsetX = camera.position.x - controls.target.x;
      const offsetY = camera.position.y - controls.target.y;
      const offsetZ = camera.position.z - controls.target.z;
      const distance = Math.hypot(offsetX, offsetY, offsetZ);
      return { distance, azimuth: Math.atan2(offsetX, offsetZ) };
    },
    projectAnchor(name) {
      const anchor = anchors[name];
      anchor.getWorldPosition(projected);
      projected.project(camera);
      return { x: projected.x * 0.5 + 0.5, y: -projected.y * 0.5 + 0.5 };
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
      for (const hit of hits) {
        const found = classify(hit.object);
        if (explodeAmount >= EXPLODE_READY && found.part) {
          return { kind: "part", id: found.part.userData.id, category: found.part.userData.category };
        }
        if (found.operable) return { kind: "operable", id: found.operable.userData.operableId };
        if (found.part) {
          return { kind: "part", id: found.part.userData.id, category: found.part.userData.category };
        }
      }
      if (hits.length === 0) return { kind: "empty" };
      return { kind: "scenery" };
    },
    render(state, deltaSeconds) {
      elapsed += deltaSeconds;
      playTime = state.time;
      try {
        applyExplode(state.explodeTarget, deltaSeconds, state.reduceMotion);
        setHighlight(state.selectedId);
        placeGarments(state.time);
        const timedDoors = updateCycle(state.time);
        updateDoors(timedDoors, deltaSeconds, state.reduceMotion);
        updateArm(state.time);
        controls.update();
        renderer.render(scene, camera);
      } catch (error) {
        if (!renderErrorLogged) {
          renderErrorLogged = true;
          console.error(error && error.stack ? error.stack : error);
        }
      }
    },
  };
}

export { EXPLODE_READY };
