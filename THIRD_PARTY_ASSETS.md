# Third-party visual assets

The surface maps below are provided by **Poly Haven**, released under **CC0 1.0**. They may be used, modified and redistributed, including with this game. The environment meshes, procedural fallback characters and weapons, attachments, sky, grass, effects and synthesized audio remain project-generated. Detailed operator and first-person assets have separate credits below.

- Provider license: https://polyhaven.com/license
- CC0 legal text: https://creativecommons.org/publicdomain/zero/1.0/legalcode
- Retrieved: November 5, 2026.
- Maps are bundled locally in `public/textures/`; gameplay does not contact Poly Haven.
- Exact source URLs and verified MD5 checksums appear in `public/textures/manifest.json`.

| Asset | Source | Bundled maps | Use |
| --- | --- | --- | --- |
| Coast Sand 02 | https://polyhaven.com/a/coast_sand_02 | 1K JPEG diffuse, OpenGL normal, roughness | Beach and courtyard |
| Concrete Wall 003 | https://polyhaven.com/a/concrete_wall_003 | 1K JPEG diffuse, OpenGL normal, roughness | Compound walls and floors |
| Rock Boulder Cracked | https://polyhaven.com/a/rock_boulder_cracked | 1K JPEG diffuse, OpenGL normal, roughness | Boulders, cliffs, pebbles |
| Weathered Planks | https://polyhaven.com/a/weathered_planks | 1K JPEG diffuse, OpenGL normal, roughness | Crates, shelves, jetty |
| Denim Fabric | https://polyhaven.com/a/denim_fabric | 1K JPEG OpenGL normal, roughness | Fabric weave on sleeves, gloves, bags and equipment |

The image files are unchanged from the provider. Runtime UV scaling, color tint, roughness and normal strength are adjusted for this scene. Fabric color is authored in code; only the weave and roughness maps are used. CC0 attribution is not required, but is retained here for provenance.

## Skinned operator — November 6, 2026

`public/models/operator.glb` replaces the procedural bodies of Rook, Vale and the armed enemies. It is a locally bundled, approximately 5.09 MiB GLB with embedded textures, a skin skeleton and 11 animation clips. The hostage and first-person arms/weapon remain procedural.

| Contribution | Creator / original work | License |
| --- | --- | --- |
| Character mesh, skin rig and textures | DanlyVostok / 1799danly, [Military tactical suit (LowPolyGameReady)](https://sketchfab.com/3d-models/military-tactical-suit-lowpolygameready-ef698ce36b1545a78ce592dd3db4c7ed) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Source rig used by the intermediate animation pack | BAMEN, [FREE Military Soldier RIGGED](https://sketchfab.com/3d-models/free-military-soldier-rigged-e9c56308a67d4a3db62e914fafa4d198) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Authored animation clips | Quaternius, [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Source GLB conversion, WebP encoding and prior animation retargeting | [cktang88 / 3d-fps](https://github.com/cktang88/3d-fps), revision `130ac2a5c856401ec36e7d35afcfefe40c5801f4` | Underlying asset licenses above, retained in the source asset metadata and credits |

Creator licensing was checked against the public Sketchfab model API for both character sources, and Quaternius's library page. The tactical model retains its original creator/title/source/license metadata. No code from the intermediary game is copied. BAMEN's body mesh and the intermediary pack's `mocap_*` clips are not shipped.

Tideline modifications: selected clips are retargeted onto the tactical suit at 30 samples/second; ground correction is baked from the deformed mesh; the displaced headset mesh is omitted; runtime arm/foot constraints, aiming, faction tint and a friendly marker are added. The support-hand reload gesture is procedural. The included authored reload clip is retained for future tuning but is not selected by the runtime. None of the creators endorses this project.

Exact immutable download URLs and SHA-256 hashes of both source files and the generated asset appear in `public/models/manifest.json`. To reproduce, download those source URLs as `artifacts/character-source/soldier_tac.glb` and `soldier.glb`, then run `node scripts/prepare-character.mjs`. The script checks source hashes before adapting them; no Blender, paid tools or credentials are required. `npm run check:assets` verifies the bundled GLB checksum, required clips and self-contained images/buffers.

Attribution is also shipped in `public/credits.html`, linked from the game's briefing, so it remains available in the production build.

## First-person hands, rifle and optic — November 8, 2026

The following assets are **CC BY 4.0**, verified against their creators' Sketchfab model API license records on November 8, 2026. Attribution is also available in the game's [asset credits](public/credits.html). No endorsement is implied.

| Work | Creator | Use |
| --- | --- | --- |
| [Fps arms](https://sketchfab.com/3d-models/fps-arms-9452ce4cddde4110a4fd73e555a8e412) | DJMaesen / bumstrum | Gloved arms, sleeves and textures |
| [FPS AK-74m animations](https://sketchfab.com/3d-models/fps-ak-74m-animations-94be8385c402474cacd39bc096c6ca14) | Cransh / ccransh | Arm rig and grip template |
| [M4A1](https://sketchfab.com/3d-models/m4a1-40d8ef818c7549a896371cbb1f64fec6) | Firewarden3D / Firewarden | Rifle geometry and textures |
| [Generic Red Dot Scope / Rifle Attachment Lowpoly](https://sketchfab.com/3d-models/generic-red-dot-scope-rifle-attachment-lowpoly-8bf2794c30d04fa0aed1e3df92cd8a9e) | valterjherson1 | Micro red-dot sight geometry and textures |

[License terms: CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source conversion, rig fitting, AO baking and removal of optic branding are credited to [cktang88 / 3d-fps](https://github.com/cktang88/3d-fps/tree/130ac2a5c856401ec36e7d35afcfefe40c5801f4). Only credited asset data was reused; no upstream game code or Fab rifle animation set is included.

`public/models/first-person.glb` (2.71 MiB) includes the rifle and skinned arms. `public/models/reflex-sight.glb` (0.84 MiB) contains only the micro optic, with the other optics excluded. Both are self-contained. Tideline embeds the external arm maps, decodes compressed geometry, extends cropped upper sleeves, removes the unused vertical-grip clip, changes material response, and adds original camera fitting, shoulder/wrist constraints, magazine reload choreography, reticle, riser and suppressor.

Exact immutable source URLs and SHA-256 checksums are in `public/models/viewmodel-manifest.json`. To reproduce, place its four source files in `artifacts/fp-source/` and run `node scripts/prepare-viewmodel.mjs`; input hashes are checked before conversion. Run `npm run check:assets` to check the shipped files. No runtime downloads are required.
