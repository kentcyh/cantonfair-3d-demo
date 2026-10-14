# 洗衣舖 3D 演示

Mobile-first Canton Fair laundry shop for a phone held in portrait (reference 390×844). One static page: washer, dryer, and a folding arm.

Cloudflare Pages project name: `cantonfair-3d-demo`

## Open locally

Modules do not load from `file://`. From this folder:

```bash
python3 -m http.server 4173
```

Open http://127.0.0.1:4173 . For a phone-sized check, use a 390×844 viewport.

```bash
npm test
```

## Cloudflare Pages

- Framework preset: None
- Build command: empty (there is a no-op `npm run build` if a preset runs it)
- Output directory: `/` (repository root)
- Project name: `cantonfair-3d-demo`

## What the page does

**▶ 播放流程** runs one continuous show, about 19 seconds. Tap again to stop and reset; after it finishes, tap to replay.

| Chip | Beat | About |
|---|---|---|
| ① 入機 | 3.2s | Three garments leave the basket and go into the washer, one by one |
| ② 洗衣 | 3.0s | Door shuts, drum tumbles, water swirls |
| ③ 轉乾 | 3.4s | Same garments travel across into the dryer |
| ④ 乾衣 | 3.0s | Dryer tumbles with a soft airflow |
| ⑤ 摺衫 | 3.9s | The arm folds each garment on the side table |
| ⑥ 疊好 | 2.4s | Folds settle into one aligned pile |

The cloth meshes stay in the scene the whole time. They are not hidden and swapped.

**◇ 爆炸視圖 · 睇零件** eases parts apart. Tap a part for Jenny’s supplier card (泵／密封／電機／移動驅動／靈巧手). Tap again to restore.

Idle taps: the washer or dryer door opens and shuts, and the gripper waves. During Play, the show owns the doors.

One finger orbits within a small angle. Pinch zooms. The camera cannot flip under the floor.

## What changed from the first booth build

- Shop set: tile floor, back counter, bottles, laundry basket, folding table, wall and window light.
- Lighting: hemisphere plus one shadow-casting key light, a fill light, soft contact shadows, and a small room env map so enamel, steel, and fabric read differently.
- Machines stay procedural (no glTF). Doors, drums, gaskets, pumps, and motors are built from meshes.
- Explode proxies are larger and stay in frame.
- Water and airflow use soft normal-blended color instead of white additive flashes. Chips hold a steady cyan border for the active beat.

## Payload

No CDN. Three.js r170 is vendored (MIT). Approximate gzip sizes:

| File | gzip |
|---|---|
| `vendor/three.module.min.js` | ~167 KB |
| `vendor/OrbitControls.js` | ~7 KB |
| `js/shop.js` + `js/playback.js` + `js/main.js` | ~16 KB |
| HTML + CSS + the rest of the page script | ~5 KB |
| **Whole page** | **~195 KB** |

There is no glTF. The hero machines are procedural so the booth Wi‑Fi only fetches the page above.

## Decisions and limits

- Drag orbits only. Pan is off so the shop cannot slide out of frame.
- One 1024 shadow map. If a booth phone misses a smooth frame rate, turn `renderer.shadowMap.enabled` off in `js/shop.js` before touching the pick targets.
- Part cards are category-level. Two pumps share one card.
- Supplier lines are still Jenny’s draft.

## TODO

- Swap the procedural machines for real glTF when factory models are ready.
- Replace `js/catalog.js` when Jenny’s formal supplier copy arrives.
- Cloth is hinged cards, not a simulation. A later pass can swap in a light cloth solver if the booth hardware allows it.
