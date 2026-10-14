import { SUPPLIER_ORDER, SUPPLIERS } from "./catalog.js";
import { FOLD_END_SECONDS, chipStep, phaseFromTime } from "./playback.js";
import { EXPLODE_READY, createShop } from "./shop.js";

const MAX_DELTA_SECONDS = 0.05;
const TAP_SLOP_PX = 8;
const HINT_IDLE = "開爆炸視圖後，點零件彈出類別";
const HINT_EXPLODED = "點散開的零件";
const HINT_NEED_EXPLODE = "請先開啟爆炸視圖，再點零件";
const LIVE_LABELS = ["", "正在洗衣", "正在乾衣", "正在摺衫"];

function required(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const canvas = required("#scene");
const fallback = required("#scene-fallback");
const playButton = required("#play");
const explodeButton = required("#explode");
const card = required("#supplier-card");
const cardClose = required("#card-close");
const cardDot = required("#card-dot");
const cardZh = required("#card-zh");
const cardRole = required("#card-role");
const cardEn = required("#card-en");
const hint = required("#supplier-hint");
const legend = required("#legend");
const stepLive = required("#step-live");
const chips = [required("#chip-wash"), required("#chip-dry"), required("#chip-fold")];
const labelElements = {
  washer: required("#label-washer"),
  dryer: required("#label-dryer"),
  arm: required("#label-arm"),
  folded: required("#label-folded"),
};

for (const id of SUPPLIER_ORDER) {
  const item = SUPPLIERS[id];
  if (!item) throw new Error(`Missing supplier ${id}`);
  const row = document.createElement("li");
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background = item.color;
  const zh = document.createElement("span");
  zh.textContent = item.zh;
  const en = document.createElement("span");
  en.className = "en";
  en.textContent = item.en;
  row.append(dot, zh, en);
  legend.append(row);
}

let shop = null;
try {
  shop = createShop(canvas);
} catch (error) {
  console.error(error);
  shop = null;
}

if (!shop) {
  fallback.hidden = false;
} else {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let playing = false;
  let playTime = 0;
  let explodeTarget = 0;
  let selectedId = null;
  let hintTimer = 0;
  let frameId = 0;
  const activePointers = new Set();
  let trackingTap = false;
  let tapStartX = 0;
  let tapStartY = 0;

  function setPlayButton() {
    playButton.textContent = playing ? "■ 停止" : "▶ 播放流程";
    playButton.classList.toggle("is-playing", playing);
    playButton.setAttribute("aria-pressed", String(playing));
  }

  function syncHint() {
    hint.textContent = explodeTarget === 1 ? HINT_EXPLODED : HINT_IDLE;
    hint.classList.remove("is-alert");
  }

  function setChip(step) {
    chips.forEach((chip, index) => {
      const active = index + 1 === step;
      chip.classList.toggle("is-active", active);
      if (active) chip.setAttribute("aria-current", "step");
      else chip.removeAttribute("aria-current");
    });
    const label = LIVE_LABELS[step] ?? "";
    if (stepLive.textContent !== label) stepLive.textContent = label;
  }

  function clearCard() {
    card.hidden = true;
    selectedId = null;
  }

  function showCard(id, category) {
    const item = SUPPLIERS[category];
    if (!item) return;
    selectedId = id;
    card.hidden = false;
    cardDot.style.background = item.color;
    card.style.setProperty("--accent", item.color);
    cardZh.textContent = item.zh;
    cardRole.textContent = item.role;
    cardEn.textContent = item.en;
  }

  function flashNeedExplode() {
    hint.textContent = HINT_NEED_EXPLODE;
    hint.classList.add("is-alert");
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => syncHint(), 1600);
  }

  function togglePlay() {
    if (playing) {
      playing = false;
      playTime = 0;
    } else {
      playTime = 0;
      playing = true;
    }
    setPlayButton();
  }

  function toggleExplode() {
    explodeTarget = explodeTarget === 1 ? 0 : 1;
    const exploded = explodeTarget === 1;
    explodeButton.classList.toggle("is-on", exploded);
    explodeButton.setAttribute("aria-pressed", String(exploded));
    explodeButton.textContent = exploded ? "◇ 還原視圖" : "◇ 爆炸視圖 · 睇零件";
    if (!exploded) clearCard();
    syncHint();
  }

  function placeLabels() {
    for (const [name, element] of Object.entries(labelElements)) {
      const point = shop.projectAnchor(name);
      element.style.left = `${clamp(point.x, 0.08, 0.92) * 100}%`;
      element.style.top = `${clamp(point.y, 0.06, 0.94) * 100}%`;
      element.classList.add("is-placed");
    }
  }

  function renderFrame(deltaSeconds) {
    if (playing) {
      playTime += deltaSeconds;
      if (playTime >= FOLD_END_SECONDS) {
        playing = false;
        playTime = FOLD_END_SECONDS;
        setPlayButton();
      }
    }
    const phase = phaseFromTime(playTime);
    setChip(chipStep(playing, playTime));
    shop.render({
      wash: phase.wash,
      dry: phase.dry,
      fold: phase.fold,
      explodeTarget,
      selectedId,
      reduceMotion,
    }, deltaSeconds);
    placeLabels();
  }

  function onTap(clientX, clientY) {
    const hit = shop.pick(clientX, clientY);
    if (hit.kind === "part") {
      if (shop.getExplodeAmount() < EXPLODE_READY) {
        flashNeedExplode();
        return;
      }
      showCard(hit.id, hit.category);
      return;
    }
    if (shop.getExplodeAmount() >= EXPLODE_READY) clearCard();
  }

  playButton.addEventListener("click", togglePlay);
  explodeButton.addEventListener("click", toggleExplode);
  cardClose.addEventListener("click", () => clearCard());

  canvas.addEventListener("pointerdown", (event) => {
    activePointers.add(event.pointerId);
    if (activePointers.size === 1) {
      trackingTap = true;
      tapStartX = event.clientX;
      tapStartY = event.clientY;
    } else {
      trackingTap = false;
    }
  });

  window.addEventListener("pointerup", (event) => {
    const shouldTap = trackingTap && activePointers.size === 1 && activePointers.has(event.pointerId);
    activePointers.delete(event.pointerId);
    if (!shouldTap) {
      trackingTap = false;
      return;
    }
    trackingTap = false;
    const dx = event.clientX - tapStartX;
    const dy = event.clientY - tapStartY;
    if (dx * dx + dy * dy > TAP_SLOP_PX * TAP_SLOP_PX) return;
    onTap(event.clientX, event.clientY);
  });

  window.addEventListener("pointercancel", (event) => {
    activePointers.delete(event.pointerId);
    trackingTap = false;
  });

  function startLoop() {
    if (frameId) return;
    let last = performance.now();
    const tick = (now) => {
      frameId = requestAnimationFrame(tick);
      const deltaSeconds = Math.min(MAX_DELTA_SECONDS, (now - last) / 1000);
      last = now;
      renderFrame(deltaSeconds);
    };
    frameId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    cancelAnimationFrame(frameId);
    frameId = 0;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopLoop();
    else startLoop();
  });

  window.__shop = {
    screenPositionOf: (id) => shop.screenPositionOf(id),
    getView: () => shop.getView(),
    getSnapshot: () => ({
      playing,
      playTime,
      explodeTarget,
      explodeAmount: shop.getExplodeAmount(),
      selectedId,
      cardHidden: card.hidden,
      cardZh: cardZh.textContent,
      cardRole: cardRole.textContent,
      cardEn: cardEn.textContent,
      chip: chipStep(playing, playTime),
    }),
  };

  setPlayButton();
  syncHint();
  startLoop();
}
