# Verification record

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
