import { Simulation } from './simulation.js';
import { GameView } from './render.js';
import { FieldAudio } from './audio.js';
import { handlingLabel } from './weapon.js';
import { SOLIDS, HOSTAGE, EXTRACT, dist, clamp, visible } from './world.js';

const $ = id => document.getElementById(id);
const sim = new Simulation(), audio = new FieldAudio();
let view, mode = 'menu', controlsFrom = 'menu', sensitivity = 1, radioUntil = 0, hitUntil = 0, last = performance.now(), windowed = false;
let keys = new Set(), firing = false, aiming = false;
try { view = new GameView($('game')); view.bind(sim); }
catch (error) { $('error').hidden = false; $('error').textContent = `Unable to start the 3D renderer. This game requires WebGL 2. Enable browser hardware acceleration and reload. Details: ${error.message}`; throw error; }
const assetStatus = document.createElement('small'); assetStatus.className = 'asset-status'; assetStatus.textContent = 'Loading environment, operators and weapon…'; $('start').after(assetStatus); $('start').disabled = true;
view.assetsReady.then(failed => { $('start').disabled = false; assetStatus.textContent = failed.length ? 'Some visual assets are unavailable. Gameplay is ready with fallback models.' : 'Ready · Materials, operators and weapon stored locally'; });
let immersiveHud = false, highQuality = true;
const immersionButton = document.createElement('button'), qualityButton = document.createElement('button');
immersionButton.className = qualityButton.className = 'text-button';
function toggleImmersion() { immersiveHud = !immersiveHud; document.body.classList.toggle('immersive', immersiveHud); immersionButton.textContent = `HUD: ${immersiveHud ? 'MINIMAL' : 'FULL'} [I]`; }
immersionButton.textContent = 'HUD: FULL [I]'; immersionButton.onclick = toggleImmersion;
qualityButton.textContent = 'GRAPHICS: HIGH'; qualityButton.onclick = () => { highQuality = !highQuality; view.setQuality(highQuality); qualityButton.textContent = `GRAPHICS: ${highQuality ? 'HIGH' : 'BALANCED'}`; };
$('restart').after(immersionButton, qualityButton);

function clearInput() { keys.clear(); firing = false; aiming = false; }
function setMode(next) {
  mode = next; clearInput();
  for (const name of ['menu', 'pause', 'controls', 'map', 'end']) $(name).hidden = next !== name;
  $('hud').hidden = next === 'menu' || next === 'end';
  if (next !== 'playing') { if (document.pointerLockElement) document.exitPointerLock(); audio.pause(true); }
  else audio.pause(false);
}
async function capture() {
  windowed = false;
  try {
    const result = $('game').requestPointerLock();
    if (result?.then) await result;
  } catch { setMode('pause'); $('pause').querySelector('p').textContent = 'Click Resume to capture the mouse. If capture is blocked, open this local URL in Chrome or Edge.'; }
}
function deploy() {
  sim.reset(); sim.start(); view.bind(sim); view.camera.position.set(sim.player.x, 1.68, sim.player.z); radioUntil = 0;
  audio.start(); setMode('playing'); capture();
}
function resume() { audio.start(); setMode('playing'); capture(); }
const windowedButton = document.createElement('button');
windowedButton.id = 'windowed'; windowedButton.className = 'secondary'; windowedButton.textContent = 'PLAY WITHOUT MOUSE CAPTURE';
$('resume').after(windowedButton);
windowedButton.onclick = () => { windowed = true; audio.start(); setMode('playing'); sim.radio('WINDOWED: Arrow keys look · Space fires · Right-drag aims and looks · Esc pauses.'); };
$('start').onclick = deploy; $('again').onclick = deploy; $('restart').onclick = deploy;
$('resume').onclick = resume;
$('to-menu').onclick = () => { sim.reset(); view.bind(sim); setMode('menu'); };
$('controls-toggle').onclick = () => { controlsFrom = 'menu'; setMode('controls'); };
$('pause-controls').onclick = () => { controlsFrom = 'pause'; setMode('controls'); };
$('close-controls').onclick = () => setMode(controlsFrom);
$('close-map').onclick = () => { if (windowed) setMode('playing'); else resume(); };
$('sensitivity').oninput = e => sensitivity = Number(e.target.value);
$('volume').oninput = e => audio.setVolume(Number(e.target.value));
$('game').oncontextmenu = e => e.preventDefault();
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && mode === 'playing' && !windowed) setMode('pause'); });
document.addEventListener('pointerlockerror', () => { if (mode === 'playing') setMode('pause'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') setMode('pause'); });
window.addEventListener('blur', () => { if (mode === 'playing') setMode('pause'); else clearInput(); });
document.addEventListener('mousemove', e => {
  if (mode !== 'playing' || (document.pointerLockElement !== $('game') && !(windowed && aiming))) return;
  const speed = .0018 * sensitivity * (aiming ? .65 : 1);
  sim.player.yaw -= e.movementX * speed;
  sim.player.pitch = clamp(sim.player.pitch - e.movementY * speed, -1.35, 1.35);
});
document.addEventListener('mousedown', e => { if (mode !== 'playing') return; if (e.button === 0) firing = true; if (e.button === 2) aiming = true; });
document.addEventListener('mouseup', e => { if (e.button === 0) firing = false; if (e.button === 2) aiming = false; });
document.addEventListener('keydown', e => {
  if (['Tab', 'Space', 'ControlLeft', 'ControlRight', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Escape') {
    if (mode === 'playing') setMode('pause');
    else if (mode === 'controls') setMode(controlsFrom);
    else if (mode === 'map') setMode('pause');
    return;
  }
  if ((e.code === 'Tab' || e.code === 'KeyM') && (mode === 'playing' || mode === 'map' || mode === 'pause')) {
    if (mode === 'map') { if (windowed) setMode('playing'); else resume(); } else { setMode('map'); drawMap(); } return;
  }
  if (mode !== 'playing') return;
  keys.add(e.code);
  if (e.code === 'KeyR') sim.reload();
  if (e.code === 'KeyH') sim.heal();
  if (e.code === 'KeyF') sim.player.light = !sim.player.light;
  if (e.code === 'KeyI') toggleImmersion();
  if (e.code === 'Digit1') sim.order('follow');
  if (e.code === 'Digit2') sim.order('hold');
  if (e.code === 'Digit3') sim.order('regroup');
});
document.addEventListener('keyup', e => keys.delete(e.code));
const friendlyLabels = sim.friends.map(f => {
  const label = document.createElement('div'); label.className = 'friendly-label'; label.textContent = `● ${f.name}`;
  $('hud').appendChild(label); return label;
});

function drawMap() {
  const c = $('map-canvas').getContext('2d'), width = 720, height = 680;
  const sx = x => (x + 34) * 10, sz = z => (z + 28) * 9.5;
  c.fillStyle = '#14242a'; c.fillRect(0, 0, width, height);
  c.strokeStyle = '#647d7420'; c.lineWidth = 1;
  for (let x = 0; x < width; x += 50) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, height); c.stroke(); }
  for (let y = 0; y < height; y += 50) { c.beginPath(); c.moveTo(0, y); c.lineTo(width, y); c.stroke(); }
  c.fillStyle = '#203e4a'; c.fillRect(0, sz(34), width, height - sz(34));
  c.fillStyle = '#334441'; c.fillRect(sx(-18), sz(-16), 360, 31 * 9.5);
  for (const b of SOLIDS) { c.fillStyle = b.kind === 'building' ? '#a5af94' : b.kind === 'wall' ? '#778b7b' : '#5a726a'; c.fillRect(sx(b.x - b.w / 2), sz(b.z - b.d / 2), Math.max(3, b.w * 10), Math.max(3, b.d * 9.5)); }
  c.font = '11px monospace'; c.textAlign = 'center'; c.fillStyle = '#b0c1ae';
  c.fillText('HOLDING / 04', sx(9), sz(-18)); c.fillText('STORES', sx(-8), sz(-13));
  c.fillText('BEACH APPROACH', sx(-3), sz(24)); c.fillText('WEST', sx(-25), sz(2)); c.fillText('EAST', sx(25), sz(2));
  c.fillStyle = '#7697a3'; c.fillText('K E S T R E L   B A Y', sx(-2), sz(39));
  c.strokeStyle = '#92cfc9'; c.beginPath(); c.arc(sx(EXTRACT.x), sz(EXTRACT.z), 38, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#92cfc9'; c.fillText('EXFIL', sx(EXTRACT.x), sz(EXTRACT.z) - 45);
  for (const f of sim.friends) {
    c.fillStyle = f.hp ? '#8ac6b4' : '#cc8d74'; c.beginPath(); c.arc(sx(f.x), sz(f.z), 5, 0, Math.PI * 2); c.fill(); c.fillText(f.name, sx(f.x), sz(f.z) + 18);
  }
  const h = sim.hostage; c.fillStyle = '#dddfa9'; c.font = '22px monospace'; c.fillText('◇', sx(h.x), sz(h.z) + 6);
  c.save(); c.translate(sx(sim.player.x), sz(sim.player.z)); c.rotate(-sim.player.yaw); c.fillStyle = '#eef2dc'; c.beginPath(); c.moveTo(0, -10); c.lineTo(-7, 7); c.lineTo(0, 3); c.lineTo(7, 7); c.closePath(); c.fill(); c.restore();
  c.fillStyle = '#b4c3ba'; c.font = '11px monospace'; c.fillText('N ↑', width - 35, 30); c.fillText('10 m', 70, height - 28); c.fillRect(20, height - 20, 100, 2);
}

function updateHud() {
  const p = sim.player, h = sim.hostage;
  sim.friends.forEach((f, i) => {
    const screen = view.project({ x: f.x, y: f.hp ? 2.13 : .7, z: f.z });
    const label = friendlyLabels[i]; label.hidden = !screen.visible || dist(p, f) > 24 || !visible(p, f, p.crouch ? 1 : 1.68, f.hp ? 1.6 : .3);
    label.style.left = `${screen.x}px`; label.style.top = `${screen.y}px`; label.textContent = `${f.hp ? '●' : '+'} ${f.name}`;
  });
  $('health').textContent = Math.ceil(p.hp); $('health-bar').style.width = `${p.hp}%`;
  $('health-bar').style.background = p.hp < 35 ? '#d7907d' : '#c7d5b6';
  $('stamina-bar').style.width = `${p.stamina}%`; $('ammo').textContent = String(p.ammo).padStart(2, '0'); $('reserve').textContent = `/ ${String(p.reserve).padStart(3, '0')}`;
  $('medkit').textContent = `H · FIELD DRESSING × ${p.medkits}`;
  $('weapon-status').innerHTML = p.reload ? 'RELOADING' : p.ammo === 0 ? 'EMPTY · PRESS R' : 'AUTO <i></i> SUPPRESSED';
  $('handling-status').textContent = handlingLabel(p);
  $('crosshair').style.opacity = p.weapon.lowReady || p.reload || p.heal ? '0' : p.aim ? '.5' : '.75';
  // Project the angular dispersion into screen space at the current field of view.
  const gap = Math.max(3, Math.tan(p.weapon.spread) * innerHeight / (2 * Math.tan(view.camera.fov * Math.PI / 360)));
  $('crosshair').style.setProperty('--gap', `${gap}px`);
  $('damage').style.opacity = Math.min(.7, p.hurt * .55 + (p.hp < 35 ? .12 : 0));
  const heading = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
  $('heading').textContent = Math.round(heading).toString().padStart(3, '0'); $('bearing').textContent = ['N','NE','E','SE','S','SW','W','NW'][Math.round(heading / 45) % 8];
  const elapsed = Math.floor(sim.time), seconds = elapsed % 60, minutes = 14 + Math.floor(elapsed / 60);
  $('clock').textContent = `02:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  const objective = h.freed ? 'Escort to extraction' : sim.stage === 'infiltrate' ? 'Approach the compound' : 'Locate Dr. Elian';
  $('objective-title').textContent = objective;
  $('objective-detail').textContent = h.freed ? 'Eastern cove · Bring the principal to the blue beacon.' : sim.stage === 'infiltrate' ? 'Three approaches. Keep the team close.' : 'Northeast holding room · Hold E to release.';
  const mark = view.project({ ...(h.freed ? EXTRACT : HOSTAGE), y: h.freed ? 1.1 : 4.7 });
  $('marker').style.display = mark.visible ? 'flex' : 'none'; $('marker').style.left = `${clamp(mark.x, 40, innerWidth - 70)}px`; $('marker').style.top = `${clamp(mark.y, 100, innerHeight - 180)}px`;
  $('marker-text').textContent = `${h.freed ? 'EXFIL' : 'HOLDING'} / ${Math.round(dist(p, h.freed ? EXTRACT : HOSTAGE))} M`;
  let awareness = 0;
  for (const enemy of sim.enemies) if (enemy.hp > 0) awareness = Math.max(awareness, enemy.awareness);
  $('awareness').style.opacity = awareness > .1 ? String(Math.min(1, awareness * 1.6)) : '0';
  $('awareness').querySelector('span').style.transform = `scaleX(${awareness})`;
  $('awareness').querySelector('small').textContent = awareness >= 1 ? 'CONTACT' : 'OBSERVED';
  const interaction = sim.interactionTarget();
  $('prompt').hidden = !interaction && sim.extraction === 0;
  if (interaction) { $('prompt-label').textContent = interaction.label; $('interact-bar').style.width = `${sim.interaction / interaction.duration * 100}%`; }
  else if (sim.extraction) { $('prompt-label').textContent = 'Extraction in progress · Hold the area'; $('interact-bar').style.width = `${sim.extraction / 3 * 100}%`; }
  $('activity').hidden = !p.reload && !p.heal && !(h.freed && dist(p, EXTRACT) < 5 && dist(h, EXTRACT) >= 6);
  $('activity').textContent = p.reload ? `RELOADING / ${p.reload.toFixed(1)}s` : p.heal ? `TREATING INJURY / ${p.heal.toFixed(1)}s` : 'WAIT FOR THE PRINCIPAL';
  $('order-label').textContent = sim.command === 'hold' ? 'HOLDING' : 'FOLLOWING';
  sim.friends.forEach((f, i) => { $(i ? 'vale' : 'rook').innerHTML = `<i></i><span>${f.name}</span><em style="transform:scaleX(${f.hp / 100});background:${f.hp ? '#c9d6bd' : '#c98672'}"></em><small>${f.hp ? `${Math.round(dist(p, f))} M` : 'DOWN'}</small>`; });
  $('hostage-status').hidden = !h.freed; $('hostage-distance').textContent = `${Math.round(dist(p, h))} M · ${dist(p, h) > 12 ? 'WAIT FOR HIM' : 'FOLLOWING'}`;
  $('radio').style.opacity = sim.time < radioUntil ? '1' : '0';
  $('hitmarker').style.opacity = sim.time < hitUntil ? '1' : '0';
  $('bottom-hint').innerHTML = windowed ? '<kbd>ARROWS</kbd> LOOK <span>·</span> <kbd>SPACE</kbd> FIRE <span>·</span> <kbd>TAB</kbd> MAP <span>·</span> <kbd>ESC</kbd> PAUSE' : '<kbd>TAB</kbd> FIELD MAP <span>·</span> <kbd>ESC</kbd> PAUSE <span>·</span> <kbd>F</kbd> LIGHT';
}
function endMission() {
  const won = sim.status === 'won'; setMode('end');
  $('end-eyebrow').textContent = won ? 'OPERATION COMPLETE / PRINCIPAL RECOVERED' : 'OPERATION FAILED / ELEMENT LEAD LOST';
  $('end-title').textContent = won ? 'A way home.' : 'Signal lost.';
  $('end-detail').textContent = won ? `Dr. Elian is aboard the extraction boat. ${sim.friends.filter(f => f.hp > 0).length} of 2 teammates are operational. Mission complete.` : 'Exposure is costly. Use cover, crouch near patrols, and let your element support the approach.';
  $('end-stats').innerHTML = `<div><small>MISSION TIME</small>${Math.floor(sim.time / 60)}:${String(Math.floor(sim.time % 60)).padStart(2,'0')}</div><div><small>THREATS STOPPED</small>${sim.kills} / ${sim.enemies.length}</div><div><small>ROUNDS FIRED</small>${sim.shots}</div>`;
}
function frame(now) {
  const dt = Math.min((now - last) / 1000, .05); last = now;
  if (mode === 'playing') {
    if (windowed) {
      sim.player.yaw += ((keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0)) * dt * 1.25;
      sim.player.pitch = clamp(sim.player.pitch + ((keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)) * dt * .8, -1.35, 1.35);
    }
    sim.tick(dt, { forward: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), side: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'), crouch: keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight'), aim: aiming, interact: keys.has('KeyE') });
    if (firing || (windowed && keys.has('Space'))) sim.shoot();
    audio.listener(sim.player);
    for (const e of sim.events.splice(0)) {
      audio.event(e); view.event(e);
      if (e.type === 'radio') { $('radio-text').textContent = e.text; radioUntil = sim.time + 7; }
      if (e.type === 'hit') { hitUntil = sim.time + .14; $('hitmarker').style.color = e.killed ? '#deb77c' : '#e2e9d7'; }
      if (e.type === 'end') endMission();
    }
  }
  view.render(sim, dt, mode);
  if (mode !== 'menu') updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read-only diagnostics for reproducible verification. No gameplay bypasses.
window.tideline = Object.freeze({ snapshot: () => JSON.parse(JSON.stringify({ status: sim.status, mode, time: sim.time, stage: sim.stage, player: sim.player, friends: sim.friends.map(({ name, x, z, hp, mode }) => ({ name, x, z, hp, mode })), enemies: sim.enemies.map(({ id, x, z, hp, state }) => ({ id, x, z, hp, state })), hostage: sim.hostage, extraction: sim.extraction })), rendererInfo: () => ({ calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles }) });
