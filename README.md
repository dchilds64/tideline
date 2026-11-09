# TIDELINE / NIGHTFALL

A complete, local, first-person tactical rescue game. You lead **Morrow**, a fictional three-person maritime response unit, into a coastal relay compound at Kestrel Bay. Recover Dr. Elian and escort him to the eastern extraction boat.

Built with JavaScript, Three.js, Vite, original environment geometry and synthesized audio, locally bundled CC0 surface maps from Poly Haven, and credited textured/skinned operators, first-person arms, rifle and optic. No accounts, paid services, external asset servers, or external runtime network requests are required. This is a stylized vertical slice, not a professional military training simulator.

## Launch

Node.js 22 or newer is recommended. Dependencies are already installed in this workspace.

```powershell
cd C:\Users\Dchil\Documents\Code\personal\games
npm run dev
```

Open the Local URL printed by Vite, normally **http://127.0.0.1:5173/**, in Chrome or Edge with hardware acceleration. Click **Deploy Element**. Use a keyboard and mouse; mobile and controllers are not supported.

For a fresh checkout, run `npm ci` first. An internet connection is needed only for the initial package installation. To build and serve production files:

```powershell
npm run build
npm run preview
```

Open the preview URL printed in the terminal, normally **http://127.0.0.1:4173/**. Do not open `index.html` directly with `file://`; ES modules require an HTTP server. Stop either server with Ctrl+C.

## Controls

| Input | Action |
| --- | --- |
| Mouse | First-person look |
| W / A / S / D | Move |
| Shift, held | Sprint; drains stamina and makes more noise |
| C or Ctrl, held | Crouch; quieter movement and lower detection range |
| Left mouse, held | Automatic fire |
| Right mouse, held | Raise sights; stop and crouch to settle aim |
| R | Reload; 2.35 seconds |
| E, held | Free the hostage / revive a downed teammate |
| 1 | Follow |
| 2 | Hold current positions and engage visible threats |
| 3 | Regroup and follow |
| H | Use one field dressing; 3 seconds, restores up to 65 health |
| F | Toggle weapon light; also makes you easier to detect |
| I | Toggle minimal HUD; prompts and field map remain available |
| Tab or M | Field map; pauses simulation |
| Esc | Pause and release mouse |

The pause screen includes sensitivity and master-volume sliders, controls, and restart. To play where pointer lock is unavailable, choose **Play Without Mouse Capture** on the pause screen. In that mode, **arrow keys look**, **Space fires**, and **right-mouse drag aims and looks**. WASD and the other controls still work. The ordinary Resume button retries captured mouse mode.

## Visual realism and immersion

Visual realism and immersion are a high project priority; see [visual direction](VISUAL_DIRECTION.md). The environment has scanned sand, concrete, rock, timber and fabric surface detail, physical texture scale, normal and roughness maps, irregular boulders, clustered wind-blown grass, clouded night sky, wet ground, shoreline foam, and a more detailed extraction boat. Buildings have gutters, downpipes, service fittings, barred windows and interior shelves. First-person hands and weapon now use detailed textured models with a skinned finger rig, fabric folds, glove seams, receiver hardware, rail, separate magazine and a modeled red-dot optic. Teammates and enemies use a detailed textured character mesh with clothing, gloves, boots, a balaclava, cap and tactical equipment.

Moonlight, cached shadows for static geometry under local lamps, and a shadow-casting flashlight establish dark approach routes and warm readable interiors. High graphics adds restrained bloom and renders at up to 1.6 device pixel ratio. **Graphics: Balanced** on the pause screen disables bloom and flashlight shadows and caps pixel ratio at 1.0. Static dressing is batched to reduce draw calls. Press **I** for a minimal HUD, including an unobstructed physical red dot when aiming. Press I again to restore health/ammo/objective information.

Materials load from the repository before Deploy becomes available; missing maps fall back to neutral surfaces with a visible status message. All 14 images ship with the production build. Asset sources and licenses are recorded in [third-party assets](THIRD_PARTY_ASSETS.md).

Teammates and enemies now use a continuous skinned character mesh with retargeted idle, walking, running, crouched, aiming and death animations. Each actor has its own skeleton and animation clock. Grip constraints keep hands on the rifle, stationary stance correction plants both boots, and a procedural support-hand gesture accompanies enemy reloads. The model and its textures are bundled in one 5.09 MiB GLB. Asset loading falls back to the original procedural characters if the file is unavailable. Credits are available from the briefing and in [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md).

First-person assets add 3.04 MiB in four local GLBs with embedded textures. Native hand geometry replaces the earlier malformed fitted hands: the support arm keeps its original finger hierarchy, while the trigger hand uses a fixed rifle grip. The support shoulder stays below the camera and the elbow bends downward through the reload without stretching the sleeve mesh. Reloading reaches for the magazine, withdraws it below frame, inserts its replacement, and returns to the foregrip; an empty reload includes a bolt-release gesture. Presentation uses the simulation's 2.35-second timer, so pause and restart cannot leave a partial reload behind. The optic stays centered on the actual sight/hitscan line during ADS recoil. Muzzle effects and the flashlight emitter follow the new rifle. Loading failures retain the procedural model.

These are incremental visual improvements, not photorealism. The hostage remains procedural. Armed actors share one base model; there is no facial animation, terrain-aware walking or physical ragdoll. The trigger fingers do not animate independently. First-person reload motion is hand-authored, with approximate finger contact and an offscreen magazine swap; it is not motion capture or a full mechanical simulation. Magazines are not individually tracked, and weapon/hand collision against nearby walls remains simplified. Third-person magazine handling is an approximation. Wet surfaces reflect the sky environment and lights, not a complete reflected scene. Lamp shadows include static geometry; moon and flashlight shadows include moving actors. Navigation remains flat, and small decorative props are not new cover.

## Weapon handling

The rifle takes 0.32 seconds to raise into the sights. Sprinting lowers it and leaves a 0.3-second recovery before firing is available. Moving increases dispersion; stopping lets it settle over a short interval. Crouching reduces sway, dispersion, and recoil. Fatigue from sprinting adds breathing sway that fades as you recover. Sustained bursts accumulate muzzle climb and dispersion; letting off the trigger allows recovery. The crosshair expands with dispersion, and a small status under ammunition explains raising, moving, heavy breathing, or steady aim. Controls are unchanged.

The rendered view and shots share the same recoil, sway, and eye height, including the crouch transition. These are game-tuned approximations, not measured firearm or human-performance data. Hitscan and simplified ammunition handling remain.

## Mission and systems

- The central gate, western breach, and eastern breach provide three approaches. The western store building has two entrances. Low crates, sandbags, rocks, perimeter walls, and buildings offer cover.
- The northeast building with the warm-lit **04 / RELAY** sign holds Dr. Elian. Approach within about two meters and hold E to release him. He then follows using the same obstacle-aware navigation as the squad.
- Escort him to the blue beacon at the eastern cove. Both of you must be within the extraction area, with no nearby visible enemy, for three seconds. Eliminating every enemy is optional.
- Rook and Vale follow in an offset formation, yield when close to the player, route around walls, and periodically replan. If blocked, they clear the route and retry. They automatically engage enemies they can see. Downed teammates can be revived; their survival is not a hard mission requirement.
- Seven enemies patrol, become suspicious of noise or partial detection, alert nearby visible allies, fight visible targets, and search their last known position when sight is lost. Walls block sight and shots. Sprinting and weapon fire carry farther than walking or crouching. Walls attenuate hearing.
- In combat, enemies seek nearby reachable cover, crouch behind it, then stand or step around an edge to fire two- or three-round bursts. They pause between exposures, reload a 30-round magazine, and duck back when hit. A clear new angle makes them abandon compromised cover. Individual enemies reserve different cover positions. Crouching visibly bends the legs and lowers the torso, weapon, and hit detection.
- Cover selection uses remembered visual or audible contacts, never a hidden player's live position. Every round needs a fresh line of sight from the muzzle; breaking sight cancels a burst. After contact goes stale, the enemy leaves cover to search. To defeat cover, wait for the peek or change your angle.
- The weapon starts with 30 rounds loaded and 90 in reserve. It has timed reloads, automatic fire, aim-dependent spread, camera recoil, procedural muzzle flash, wall impacts, hit markers, and head/body hit detection. Ammo is finite.
- Enemy exposure is dangerous. Health does not regenerate. One dressing is available; taking damage interrupts treatment. Death fails the mission. Restart resets the whole mission.
- Night presentation includes moon shadows, localized warm lighting, weapon light, fog, stars, shoreline waves, an extraction boat, procedural footsteps, surf, radio clicks, gunshots, and HRTF spatial sound where supported. Radio dialogue is text.

## Scope and simplifications

- Small authored map with original environment geometry, one shared skinned operator model, a procedural civilian, and CC0 scanned surface maps. No licensed military likenesses or voice recordings.
- Flat-ground, two-dimensional collision/navigation under a three-dimensional renderer. No jumping, climbing, swimming, prone stance, leaning, vehicles, or destructible scenery. Map limits are hard boundaries.
- Hitscan weapons; no bullet drop, penetration, ricochets, suppression model, armor simulation, or complex wound model. Low cover helps through line-of-sight occlusion.
- Enemies use finite-state behavior and chance-based shots after a visibility check. Their cover planning is local geometry-based selection, not coordinated squad tactics. They do not plan team flanking maneuvers; reserve magazines are unlimited. Reactions to incoming fire currently require a hit, not a near miss. Teammates engage automatically; there is no stealth hold-fire order.
- No friendly fire. Friendly bodies do not block the player or the player's shots. The hostage cannot be injured. These choices keep the first rescue reliable.
- The map and objective marker disclose the holding building. Labels for friendly operators are shown only when visible. No enemy minimap positions are revealed.
- One mission, one weapon, no save/load, multiplayer, campaign, or persistent settings. Audio is synthesized and intentionally simple.

## Verification

```powershell
npm test
npm run check:assets
npm run build
```

Thirty-two automated tests cover physical access through all approaches, collision and occlusion, hitscan, reload timing and finite reserves, enemy search without wall tracking, squad hold/regroup and navigation, complete escort and extraction, treatment/revival, failure, and restart. Cover tests additionally verify actual shelter at the stopped position, reservations, burst timing, magazine reloads, loss of sight mid-burst, withdrawal on injury, compromised-cover relocation, hearing while concealed, and crouched hit detection. Handling tests cover raising time, sprint recovery, movement settling, crouch support, exertion recovery, accumulated recoil, invalid fire, reset, and alignment between the rendered sight line and shot rays. Imported-asset checks cover independent skeletons, shared-resource disposal, grip reach, stationary boot placement, death/revival and load fallback. Four procedural presentation checks additionally cover limb lengths, planted-foot reachability, stop/pause behavior, smooth turning and repositioning, actual rig hand constraints, crouched head alignment and muzzle-flash visibility. The escort test isolates navigation by disabling enemies; combat and cover have separate tests.

A real browser playthrough was completed through normal UI input using windowed controls: infiltration under live enemy fire, firing/reloading, injury treatment, hostage release, escort through the eastern breach, and successful extraction with both teammates operational. The result was 0:54 of simulation time, six threats stopped, and six player rounds fired. Pause/map and redeploy were also exercised. See [verification notes](VERIFICATION.md).

The cover-behavior update also received a full browser rescue-to-extraction playthrough, finishing in 1:03 with both teammates operational. This run used the squad to engage threats while the player moved and escorted the hostage; it was not a difficulty benchmark.

## Source layout

The visual update also passed a full live browser mission: 1:08, three player rounds, both teammates and the hostage extracted. High/Balanced settings and minimal HUD were checked, along with surface loading and interior/exterior lighting.

- `src/world.js`: shared map geometry, collision, visibility rays, and A* navigation.
- `src/simulation.js`: mission, health, ballistics, enemy state machines, squad, escort.
- `src/cover.js`: geometry-based hide/peek candidates, protection checks, reservations, and route scoring.
- `src/weapon.js`: shared aim transition, fatigue, sway, recoil, dispersion, and eye height.
- `src/render.js`: Three.js world, characters, first-person weapon, lighting, post-processing and effects.
- `src/appearance.js`: local surface loading, physical UV scale, boulder geometry, sky, wind-driven grass and static batching.
- `src/animation.js`: ground-anchored gait, smooth actor motion and two-bone limb solver.
- `src/actor-view.js`: procedural fallback characters and shared rifle geometry.
- `src/operators.js`: imported skinned characters, animation blending, grip/stance constraints and resource ownership.
- `scripts/prepare-character.mjs`: reproducible offline animation retargeting from verified source assets.
- `src/audio.js`: Web Audio synthesis and directional emitters.
- `src/main.js`: input, UI, map, pause, and animation loop.
- `tests/simulation.test.js`: deterministic simulation checks.

Three.js and Vite are MIT-licensed; their license files are included in their installed packages. Original environment/weapon geometry, procedural effects and audio are generated by the source. Bundled surface maps are CC0; the operator has CC BY 4.0 / CC0 credits in THIRD_PARTY_ASSETS.md.
