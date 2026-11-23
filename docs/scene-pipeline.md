# 2.5D scene (`src/scene2d`)

The scene is **rendered once offline**; the browser loads still images and the GPU recombines them with depth. There is no 3D geometry,
MSAA or post-processing at runtime, which keeps it light on integrated GPUs (about 16% GPU busy on an Intel UHD GT1 in the heaviest
night scene while interacting).

## Day cycle

Nine stops (5:30, 7:30, 10:00, 12:30, 15:30, 19:00, 20:20, 21:15, 23:30). `TimeArc` (a text-free sun/moon arc) blends continuously
between neighbouring stops; only the stop in view and its neighbours stay in GPU memory (`stops.ts`).

## Layers

Each stop has two images (`public/scenes/valley/hill-<hour>-plate.webp`, `-trees.webp`) sharing one depth map
(`hill-depth-small.png`), drawn through a 240x135 vertex grid displaced by depth on mouse move.

| Layer / file | Role |
|---|---|
| plate | Scene without near trees and mill sails; near grass sways with wind and reacts to the mouse; fireflies light the grass at night |
| mill sails | Drawn in the shader (4 blades), rotating about the hub; speed `MILL_RPM` in `ParallaxScene.tsx` |
| trees | Alpha image that sways, revealing the plate behind |
| `Leaves.tsx` | Leaves, petals and dandelion seeds in the wind; a click calls a gust |
| `Night.tsx` | Stars, village window lights (`windows.ts`), fireflies |
| `manifest.ts` | Per-stop clock, leaf tint, night factor, sail cloth colour |
| `valleyData.ts` | **Generated** by `tools/build-scene-data.mjs` (mill position and rotation plane) |
| `depth.ts` | Decodes 16-bit log depth into a 0..1 parallax map, blurred so tree edges do not stretch |

Particle motion is computed in vertex shaders from time. Wind strength is smoothed (`gustLevel`) so clicks do not cause jerks.

## Rendering a new scene

Source: [painted-valley](https://git.patch.gg/blendi/painted-valley) (code MIT, art CC0), cloned at `../painted-valley` with
`git lfs pull`. The local changes are kept in `tools/painted-valley.patch`:

- `src/lib/frame.js`: exposes `depthTexture`.
- `src/valley/sky.js`: dawn, twilight and moonlight (negative sun elevation), morning and post-sunset paths.
- `src/valley/main.js`: time limits widened to 4:30-24:00.
- `src/valley/farwoods.js`: names the sails `mill-sails` so they can be separated.

```bash
cd ../painted-valley && git apply ../kazelody/tools/painted-valley.patch
npm ci --ignore-scripts && npm run build

cd ../kazelody
node tools/capture-scene.mjs --src ../painted-valley --out captures/valley/day-high --views hill \
  --hours 5.5,7.5,10,12.5,15.5,19,20.3,21.25,23.5 --size 1920x1080 --quality high
node tools/build-scene-data.mjs --from captures/valley/day-high --view hill
python3 tools/find-windows.py captures/valley/day-high/hill-12_5-plate.webp   # -> src/scene2d/windows.ts
```

- Rendering is CPU-only (SwiftShader). **Never open painted-valley on a real GPU or browser**; it has frozen browsers. Expect 15-30
  minutes for the page to load and a few minutes per stop.
- Each stop renders two frames in the same state (full, and with near trees and sails hidden); their depth difference yields the tree mask.
- Camera views are defined in `VIEWS` in `tools/capture-scene.mjs` (`hill`, `wide`, `valley`, `village`, `peaks`) and can be overridden
  with `--views hill:fov=90:pitch=10`. Raw captures go to `captures/` (not committed).
- `build-scene-data.mjs` copies the images to `public/scenes/valley/` and generates `valleyData.ts`. Then update the clock, tint and night
  factor per stop in `manifest.ts` (and `windows.ts` if the camera changed).
