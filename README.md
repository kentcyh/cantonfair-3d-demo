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
node --test test/
```

## Cloudflare Pages

- Framework preset: None
- Build command: empty (there is a no-op `npm run build` if a preset runs it)
- Output directory: `/` (repository root)
- Project name: `cantonfair-3d-demo`

## What the page does

- **▶ 播放流程** — wash water, dryer airflow, then the arm folds a shirt. Tap again to stop and reset; after it finishes, tap to replay.
- **◇ 爆炸視圖 · 睇零件** — parts ease apart. Tap a part for a short supplier card. Tap again to restore.
- One finger orbits within a small angle. Pinch zooms. The camera cannot flip under the floor.

Supplier cards use Jenny’s draft (pump, seal, motor, mobility drive, dexterous hand).

## Decisions and limits

- Machines are procedural low-poly meshes, not glTF, so a phone stays light and the page does not fetch a CDN (Three.js r170 is in `vendor/`, MIT).
- Drag orbits only. Pan is off so the shop cannot slide out of frame.
- Part cards are category-level. Two pumps share one card.

## TODO

- Swap the procedural machines for real glTF when factory models are ready.
- Replace `js/catalog.js` when Jenny’s formal supplier copy arrives.
