# Verification record

## Skinned operator replacement — November 6, 2026

- Replaced the bodies of both teammates and armed enemies with the credited DanlyVostok tactical suit and selected Quaternius clips retargeted through the BAMEN source rig. The generated self-contained GLB is 5.09 MiB; no new npm dependencies or runtime network services are required.
- `npm test`: 27/27 passing. New tests load the actual production GLB's geometry/skeleton/clips in Node (image decoding omitted), verify independently cloned skeletons and animation clocks, disposal without invalidating shared geometry, pause, wrist/grip reach within 1.5 cm in the checked aim poses, both stationary ankles at the ground reference, crouched head height, death/revival, animation selection and failed/invalid asset fallback. Existing complete escort, combat, navigation and weapon tests pass.
- `npm run check:assets`: all 14 texture maps and the operator GLB pass checksum/provenance/self-containment checks. `npm run build`: successful. Three.js bundle now approximately 558 kB / 142 kB gzip; the non-fatal chunk-size advisory remains.
- Browser observer scene uses the production renderer and character update code. Visually inspected ready/aim, walk, crouch, reload gesture, downed pose and revival. Corrected a floating source headset, support-hand reach and raised idle boot during this work. Screenshot: `artifacts/skinned-operators.jpg` (explicitly an observer verification scene).
- Game deployment resolves local operator assets before enabling Deploy; windowed input and pause were exercised with no runtime errors logged. Automated in-app gameplay again advanced too slowly for a reliable fresh full mission playthrough. Observer controls advance only the isolated pose fixture; no such shortcut is present in the shipped game. This update has no new completed live rescue-to-extraction claim or GPU performance benchmark.
- Limits: shared base model for all armed actors, approximate directional locomotion and grip/reload overlays, flat-ground stance locking, animated fall rather than physical ragdoll. The hostage, first-person hands and weapon are still procedural. The visible upgrade does not make the overall game photorealistic.

## Character motion update — November 6, 2026

- `npm test`: 24/24 passing. Four new checks cover finite, fixed-length limb solving, ground-anchored stance and reachability from walking through sprint speeds at 20/60 FPS, settling after stopping, pause, turn wrapping, reset after repositioning, actual production-rig hand constraints, crouched head alignment and visible shot feedback at 20 FPS. Existing mission/navigation/combat tests still pass.
- `npm run build`: successful; the existing Three.js chunk-size advisory remains. No new dependency or external asset was added.
- Browser observer fixture used the production character meshes and animation code to inspect standing, walking, crouched and civilian poses. Corrected an overly bent standing posture and disconnected-looking joints during inspection. Screenshot: `artifacts/character-motion.jpg` (an observer test scene, not a mission screenshot).
- Mission deployment, windowed controls, hold order, map/pause and graphics switching were exercised. No browser runtime errors were logged. The in-app browser advanced only a few seconds of simulation during much longer input sessions, including after reducing graphics and closing extra test tabs. A new full live mission could not be reliably completed in this session; its cause was not established. This is not a successful live-playthrough or performance claim. Earlier completed browser missions are recorded below.
- The automated escort-to-extraction and combat tests pass, but do not substitute for a new full browser playthrough. Captured-mouse and subjective-audio limitations below still apply.
- Character animation is presentation-only: collision, damage, navigation and detection rules are unchanged. New simulation fields only expose contact-ready timing and shooter identity to the renderer. The rig uses flat-ground procedural stepping, approximate magazine handling and an interpolated fall; no mocap, deforming skin, finger animation, terrain IK or physical ragdoll is implemented.

## Visual realism and immersion update — November 5, 2026

- `npm test`: 20/20 passing; mission, navigation, combat and weapon-handling checks unchanged.
- `npm run check:assets`: 14 local JPEG maps verified against provider checksums, 7.79 MiB total. No external runtime asset requests are needed.
- `npm run build`: successful. Vite reports a non-fatal chunk-size advisory for the Three.js bundle (approximately 506 kB uncompressed / 128 kB gzip). Texture payload is separate and bundled in dist.
- Full live browser rescue completed using ordinary windowed controls with active enemies: 1:08 mission time, six threats stopped, three player rounds, hostage extracted and both teammates operational. Firing, reload, flashlight, minimal-HUD toggle, map and interaction were exercised. Evidence: `artifacts/graphics-mission-complete.jpg`.
- Visual inspection covered the beach approach, compound entrance, holding-room interior, extraction jetty and sea. High and Balanced quality were tested. No browser runtime errors or missing maps were observed.
- A short isolated render fixture at 1280×720 reported approximately 120 average FPS over 180-frame samples, with roughly 2.5–3.7 ms CPU render submission and 550–815 draw calls including shadows/post-processing. The fixture freezes simulation; this is not a sustained GPU benchmark, active-combat performance result, or a cross-device guarantee. Live gameplay was also inspected at the larger in-app viewport.
- Found and corrected a gate-light artifact: its source was inside the wall, causing grazing-light speckles. Moved the fixture outside the wall and visually rechecked the gate after the full playthrough. Final in-game image: `artifacts/visual-upgrade.jpg`.
- Game left running at its briefing. Pointer-lock automation and subjective audio limits below continue to apply.
- Remaining fidelity limits: procedural characters/weapon and simple animation, environment-only reflections, static-only local lamp shadows, flat navigation and non-colliding small surface props. No claim of photorealism.

## Weapon handling update

- `npm test`: 20/20 passing. Five new tests exercise raise timing, sprint-to-fire delay without ammo loss, movement settling, crouch support, exertion recovery, burst recoil versus deliberate fire, no kick on invalid fire, reset, and alignment with a real Three.js camera orientation.
- `npm run build`: successful.
- Live browser UI: nine-round automatic burst, timed reload (30 magazine / 81 reserve afterward), lateral sprinting, right-mouse aim, and pause exercised in windowed mode.
- An isolated browser fixture using the production simulation and renderer verified an unobstructed centered optic, crouched steady dispersion of 0.72 mrad, post-sprint dispersion of 2.52 mrad with 70% handling fatigue, and an eight-round burst reaching 2.18 degrees of recoil. Nine seconds of recovery returned the standing rifle to 1.20 mrad and zero displayed recoil. These are game-tuned outputs, not real firearm measurements. No runtime errors were logged in the fixture.
- The complete automated escort mission still passes. A new full live rescue-to-extraction run was not performed for this handling-only update; prior full browser playthroughs are recorded below. Captured-mouse and subjective audio limits still apply.

## Enemy cover update

- `npm test`: 15/15 passing, including seven new combat tests. These exercise actual collision-respecting travel to shelter, crouching, stand/side peeks, burst spacing, magazine reloads, sight loss mid-burst, withdrawal when injured, cover invalidation after an observed angle change, hearing while concealed, and lowered hit volumes.
- `npm run build`: successful with the new cover module and articulated crouch pose.
- Another real browser mission completed with the updated enemy AI: 1:03, hostage extracted, both teammates operational, six threats stopped. Player weapon use was not required on this run; teammates performed the engagements. This verifies mission continuity, not a claim that difficulty or balance is final.
- An isolated simulation trace verified repeated move → hide → peek → return cycles and reloading. A regression assertion caught and fixed an arrival-tolerance issue: enemies initially stopped near the intended safe point but could still be exposed at a corner. Cover navigation now finishes within 8 cm, with hide candidates farther inside the edge.
- Browser input continues to use the documented windowed mode for automation. Captured-mouse and subjective audio verification limits below still apply.
- An isolated browser fixture visibly confirmed the crouched hide pose at 3.0 seconds and standing side-peek/fire at 6.0 seconds, with no browser runtime errors. Screenshot: `artifacts/enemy-cover.jpg`. This is an observer view of a test scenario, not a gameplay screenshot.

## Original vertical slice

Verified in this Windows workspace on November 4, 2026 (America/Denver).

## Passed

- `npm test`: 8 of 8 tests pass.
- `npm run build`: production build succeeds, with separate application and Three.js chunks.
- Browser rendering: scene, mission briefing, first-person weapon, lit interiors, HUD, map, pause, and success screen inspected.
- Live UI input: walking, strafing, sprinting, crouching, firing, reload, field dressing, hold command, hostage interaction, map/pause, and redeploy exercised.
- Complete browser mission with active enemies using windowed controls. The player took damage, used a dressing, freed Dr. Elian, and reached the eastern boat with both teammates operational. No game-state editing, teleportation, invulnerability, or automation-only mission shortcut was used.
- Completion evidence: `artifacts/mission-complete.jpg` (generated QA artifact, ignored by Git).
- Eight simulation checks additionally verify all three approach routes, collision, occlusion, enemy last-known-position behavior, teammate regrouping, revival, and failure/reset.

## Limits

- Automated browser clicks did not grant Pointer Lock. Captured-mouse behavior could not be end-to-end verified with these tools; the standard browser API is implemented, and a playable windowed input mode is provided and was used for the full playthrough.
- A native-window selection was rejected by automatic approval review because that window belonged to an unrelated private page. No content in that window was opened; testing continued in a dedicated local game preview.
- Audio events and HRTF emitters are implemented, but subjective sound quality and left/right spatialization were not audibly verified.
- No sustained GPU benchmark or cross-device compatibility sweep was performed. The renderer caps pixel ratio at 1.6. WebGL 2 and hardware acceleration are required.
- The complete manual playthrough preceded the final small changes to friendly labels, path-replan throttling, sprint exhaustion recovery, and night detection distance. The full automated suite and production build passed again after those changes.

## Issues found and corrected

- Removed an unnecessary CSS data import that prevented the production build.
- Changed the test command to run in one Node process, avoiding restricted child-process creation in the local sandbox.
- Corrected a navigation-test starting position that was inside a rock collider.
- Added an explicit windowed input option for hosts that do not permit captured mouse input, with clear persistent control hints.
- Fixed map-close behavior to preserve windowed mode.
- Added line-of-sight-gated friendly labels and fixed secondary-button hover contrast.
- Throttled failed/finished path replanning and added sprint exhaustion hysteresis to prevent rapid walk/sprint oscillation.
