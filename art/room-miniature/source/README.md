# Kenney Furniture Kit source assets

Downloaded from the author's official page on 2026-09-25:

- Official page: https://kenney.nl/assets/furniture-kit
- Download: https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip
- Author: Kenney
- License: CC0-1.0, confirmed on the official page and in the retained `kenney-furniture-kit/License.txt`.
- Optional local archive: `kenney_furniture-kit.zip`; the complete download and unused extracted files are ignored by Git.
- The included license identifies the package as Furniture Kit (2.0).

## Files included in the repository

The repository includes exactly the 15 unchanged source GLBs required by `scripts/prepare-miniature-furniture.py`, plus `kenney-furniture-kit/License.txt`. They are listed below and in `public/assets/room-miniature/manifest.json`, which records their original paths and SHA-256 hashes. A fresh clone contains everything needed to rebuild the adapted furniture; downloading the complete pack is optional.

All file names below are inside `kenney-furniture-kit/Models/GLTF format/`:

- `loungeSofa.glb`
- `loungeChair.glb`
- `chairRounded.glb`
- `tableRound.glb`
- `bookcaseClosed.glb`
- `sideTableDrawers.glb`
- `lampRoundTable.glb`
- `lampRoundFloor.glb`
- `books.glb`
- `pillow.glb`
- `rugRectangle.glb`
- `pottedPlant.glb`
- `plantSmall1.glb`
- `cardboardBoxClosed.glb`
- `radio.glb`

From the project root, rebuild using Blender 5.2 (shown with the default macOS executable path):

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/prepare-miniature-furniture.py
```

Replace the executable path with the local Blender executable, or `blender` when it is on PATH. The command writes the adapted GLBs, manifest and license copy to `public/assets/room-miniature/`.

## Original package audit

During the original download audit, all 140 GLB models imported successfully with Blender 5.2.2. They contained no external image or buffer URLs. The complete library had 26,737 triangles before project-specific adaptation. These results describe the full downloaded package, not the 15-model subset included in a fresh clone.

To repeat the complete audit, download the official ZIP and extract its contents into `kenney-furniture-kit/`, then run:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/inspect-miniature-assets.py
```

The script inspects whichever GLBs are present: 15 in a fresh clone, or 140 after extracting the full pack. It generates the ignored local `kenney-furniture-kit/asset-catalog.json` with bounds, dimensions, mesh counts, triangle counts, materials, hashes and source paths. Values use glTF/game axes: X across, Y up, Z depth. Downloaded previews and the locally rendered contact sheet are optional working material and are not included in the repository.

## Integration notes

- Sofas, armchairs, wooden chairs, bookcases, low cabinets, and drawer consoles face **+Z** in glTF/game coordinates. Blender imports this front as **-Y**, with Z up.
- Most origins sit at a corner rather than the horizontal center. Preserve node transforms, calculate world-space bounds, center X/Z, and align the lowest Y to zero before placement. `tableRound.glb` has a negative Y minimum; naive placement sinks it into the floor.
- A uniform scale around 2 is a useful starting point for a human-sized room. Final scale should follow the existing gameplay clearances and collision sizes.
- Materials are plain PBR colors and can be recolored consistently. Common material names are `carpet`, `carpetBlue`, `carpetDarker`, `carpetWhite`, `wood`, `woodDark`, `metal`, `lamp`, and `plant`.
- `loungeSofaLong.glb` is a chaise configuration, extending in depth; its width is identical to `loungeSofa.glb`.
- `bookcaseClosed.glb` still has open shelves on its front. “Closed” describes the back and sides. `bookcaseClosedDoors.glb` is the alternative with doors.
- `tableRound.glb` has a deliberately hexagonal top. The kit contains no curtains.
- Original mesh geometry is very light. A restrained bevel pass can improve close views while retaining the common visual style.
