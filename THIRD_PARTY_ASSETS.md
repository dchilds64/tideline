# Third-party visual assets

The surface maps below are provided by **Poly Haven**, released under **CC0 1.0**. They may be used, modified and redistributed, including with this game. The environment meshes, procedural fallback characters, weapon geometry, sky, grass, effects and synthesized audio remain project-generated. The detailed operator asset has separate credits below.

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
