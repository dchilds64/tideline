# TIDELINE / NIGHTFALL

A complete, local, first-person tactical rescue game. You lead **Morrow**, a fictional three-person maritime response unit, into a coastal relay compound at Kestrel Bay. Recover Dr. Elian and escort him to the eastern extraction boat.

Built with JavaScript, Three.js, Vite, and original procedural geometry, textures, and synthesized audio. No accounts, paid services, external asset servers, or runtime network requests are required. This is a stylized vertical slice, not a professional military training simulator.

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
| Right mouse, held | Aim; narrows field of view and reduces spread |
| R | Reload; 2.35 seconds |
| E, held | Free the hostage / revive a downed teammate |
| 1 | Follow |
| 2 | Hold current positions and engage visible threats |
| 3 | Regroup and follow |
| H | Use one field dressing; 3 seconds, restores up to 65 health |
| F | Toggle weapon light; also makes you easier to detect |
| Tab or M | Field map; pauses simulation |
| Esc | Pause and release mouse |

The pause screen includes sensitivity and master-volume sliders, controls, and restart. To play where pointer lock is unavailable, choose **Play Without Mouse Capture** on the pause screen. In that mode, **arrow keys look**, **Space fires**, and **right-mouse drag aims and looks**. WASD and the other controls still work. The ordinary Resume button retries captured mouse mode.

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

- Small authored map with procedural, visibly stylized models and basic limb animation. No licensed military likenesses, downloaded art, or voice recordings.
- Flat-ground, two-dimensional collision/navigation under a three-dimensional renderer. No jumping, climbing, swimming, prone stance, leaning, vehicles, or destructible scenery. Map limits are hard boundaries.
- Hitscan weapons; no bullet drop, penetration, ricochets, suppression model, armor simulation, or complex wound model. Low cover helps through line-of-sight occlusion.
- Enemies use finite-state behavior and chance-based shots after a visibility check. Their cover planning is local geometry-based selection, not coordinated squad tactics. They do not plan team flanking maneuvers; reserve magazines are unlimited. Reactions to incoming fire currently require a hit, not a near miss. Teammates engage automatically; there is no stealth hold-fire order.
- No friendly fire. Friendly bodies do not block the player or the player's shots. The hostage cannot be injured. These choices keep the first rescue reliable.
- The map and objective marker disclose the holding building. Labels for friendly operators are shown only when visible. No enemy minimap positions are revealed.
- One mission, one weapon, no save/load, multiplayer, campaign, or persistent settings. Audio is synthesized and intentionally simple.

## Verification

```powershell
npm test
npm run build
```

Fifteen automated tests cover physical access through all approaches, collision and occlusion, hitscan, reload timing and finite reserves, enemy search without wall tracking, squad hold/regroup and navigation, complete escort and extraction, treatment/revival, failure, and restart. Cover tests additionally verify actual shelter at the stopped position, reservations, burst timing, magazine reloads, loss of sight mid-burst, withdrawal on injury, compromised-cover relocation, hearing while concealed, and crouched hit detection. The escort test isolates navigation by disabling enemies; combat and cover have separate tests.

A real browser playthrough was completed through normal UI input using windowed controls: infiltration under live enemy fire, firing/reloading, injury treatment, hostage release, escort through the eastern breach, and successful extraction with both teammates operational. The result was 0:54 of simulation time, six threats stopped, and six player rounds fired. Pause/map and redeploy were also exercised. See [verification notes](VERIFICATION.md).

The cover-behavior update also received a full browser rescue-to-extraction playthrough, finishing in 1:03 with both teammates operational. This run used the squad to engage threats while the player moved and escorted the hostage; it was not a difficulty benchmark.

## Source layout

- `src/world.js`: shared map geometry, collision, visibility rays, and A* navigation.
- `src/simulation.js`: mission, health, ballistics, enemy state machines, squad, escort.
- `src/cover.js`: geometry-based hide/peek candidates, protection checks, reservations, and route scoring.
- `src/render.js`: procedural Three.js world, characters, first-person weapon, effects.
- `src/audio.js`: Web Audio synthesis and directional emitters.
- `src/main.js`: input, UI, map, pause, and animation loop.
- `tests/simulation.test.js`: deterministic simulation checks.

Three.js and Vite are MIT-licensed; their license files are included in their installed packages. All game-specific visual and audio assets are generated by the source in this repository.
