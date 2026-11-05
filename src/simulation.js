import { START, EXTRACT, HOSTAGE, PATROLS, dist, clamp, blocked, moveBody, visible, findPath, wallDistance } from './world.js';
import { chooseCover, protects } from './cover.js';

const copy = p => ({ x: p.x, z: p.z });
export class Simulation {
  constructor(random = Math.random) { this.random = random; this.reset(); }
  reset() {
    this.time = 0; this.status = 'ready'; this.events = []; this.noises = []; this.kills = 0; this.shots = 0;
    this.player = { ...START, yaw: 0, pitch: 0, hp: 100, stamina: 100, crouch: false, sprint: false, aim: false, light: false, ammo: 30, reserve: 90, reload: 0, heal: 0, medkits: 1, cooldown: 0, step: 0, hurt: 0 };
    this.friends = [{ x: -5, z: 33, name: 'ROOK' }, { x: -1, z: 34, name: 'VALE' }].map((a, i) => ({ ...a, id: `friend-${i}`, type: 'friend', hp: 100, yaw: 0, mode: 'follow', path: [], repath: 0, cooldown: 1, stuck: 0, moving: false }));
    this.enemies = PATROLS.map((patrol, i) => ({ ...patrol[0], id: `enemy-${i}`, type: 'enemy', hp: 68, yaw: i % 2 ? Math.PI / 2 : Math.PI, state: 'patrol', awareness: 0, patrol, waypoint: 1, path: [], repath: 0, cooldown: 1.5 + i * .12, lastSeen: null, memory: 0, stuck: 0, moving: false, crouch: false, cover: null, coverRetry: 0, tactic: 'observe', tacticTime: 0, coverTravel: 0, pressure: 0, burst: 0, ammo: 30, reload: 0, aimTime: 0, targetId: null }));
    this.hostage = { ...HOSTAGE, id: 'hostage', name: 'DR. ELIAN', type: 'hostage', hp: 100, yaw: 0, freed: false, path: [], repath: 0, stuck: 0, moving: false };
    this.command = 'follow'; this.interaction = 0; this.interactionKey = ''; this.extraction = 0; this.stage = 'infiltrate';
  }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  radio(text) { this.emit('radio', { text }); }
  start() { this.status = 'playing'; this.radio('ROOK: Shore is clear. We’re on you, Lead.'); }
  noise(at, range, faction = 'player') {
    this.noises.push({ ...copy(at), range, faction, expires: this.time + .3 });
  }
  order(mode) {
    if (this.status !== 'playing') return;
    this.command = mode === 'regroup' ? 'follow' : mode;
    for (const f of this.friends) { f.mode = this.command; f.hold = copy(f); f.path = []; f.repath = 0; }
    this.radio(mode === 'hold' ? 'LEAD: Hold here. Cover your sector.' : mode === 'regroup' ? 'LEAD: Regroup. Close on me.' : 'LEAD: On me. Move as a team.');
  }
  reload() {
    const p = this.player;
    if (this.status !== 'playing' || p.reload || p.ammo === 30 || p.reserve <= 0 || p.heal) return;
    p.reload = 2.35; this.emit('reload');
  }
  heal() {
    const p = this.player;
    if (p.medkits && p.hp < 100 && !p.heal && !p.reload) { p.heal = 3; this.radio('LEAD: Treating injury. Cover me.'); }
  }
  shoot(direction) {
    const p = this.player;
    if (this.status !== 'playing' || p.cooldown > 0 || p.reload || p.heal || p.sprint) return false;
    if (!p.ammo) { p.cooldown = .3; this.emit('empty'); return false; }
    p.ammo--; this.shots++; p.cooldown = .115; this.noise(p, 31);
    const origin = { x: p.x, y: p.crouch ? 1.02 : 1.68, z: p.z };
    let range = wallDistance(origin, direction, 85), victim = null, headshot = false;
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      const hitVolumes = enemy.crouch ? [[1.02, .24, true], [.52, .37, false], [.3, .29, false]] : [[1.65, .24, true], [1.15, .37, false], [.55, .29, false]];
      for (const [height, radius, head] of hitVolumes) {
        const ox = origin.x - enemy.x, oy = origin.y - height, oz = origin.z - enemy.z;
        const b = ox * direction.x + oy * direction.y + oz * direction.z;
        const c = ox * ox + oy * oy + oz * oz - radius * radius, disc = b * b - c;
        if (disc < 0) continue;
        const hit = -b - Math.sqrt(disc);
        if (hit >= 0 && hit < range) { range = hit; victim = enemy; headshot = head; }
      }
    }
    const point = { x: origin.x + direction.x * range, y: origin.y + direction.y * range, z: origin.z + direction.z * range };
    this.emit('shot', { from: origin, to: point, faction: 'player', hit: !!victim });
    if (victim) { this.damage(victim, headshot ? 100 : 36, p); this.emit('hit', { killed: victim.hp <= 0 }); }
    else if (range < 85) this.emit('impact', { point });
    return true;
  }
  damage(actor, amount, source) {
    if (actor.hp <= 0) return;
    actor.hp = Math.max(0, actor.hp - amount);
    if (actor === this.player) { actor.hurt = 1; this.emit('hurt', { source }); if (actor.heal) actor.heal = 0; }
    if (actor.type === 'enemy' && actor.hp > 0) { actor.state = actor.state === 'combat' ? 'combat' : 'alerted'; actor.memory = 9; actor.pressure = 1.5; actor.coverRetry = 0; if (source) actor.lastSeen = { ...copy(source), crouch: !!source.crouch }; }
    if (actor.hp === 0) {
      if (actor.type === 'enemy') this.kills++;
      if (actor.type === 'friend') this.radio(`${actor.name}: I’m down. Need assistance.`);
      if (actor === this.player) { this.status = 'failed'; this.emit('end'); }
    }
  }
  interactionTarget() {
    const p = this.player;
    for (const f of this.friends) if (!f.hp && dist(p, f) < 2.2 && visible(p, f)) return { key: f.id, label: `Hold E · Revive ${f.name}`, duration: 2.5, actor: f };
    if (!this.hostage.freed && dist(p, this.hostage) < 2.3 && visible(p, this.hostage)) return { key: 'hostage', label: 'Hold E · Release Dr. Elian', duration: 1.7, actor: this.hostage };
    return null;
  }
  navigate(actor, goal, speed, dt, arrival = .45) {
    actor.moving = false;
    if (dist(actor, goal) < arrival) { actor.stuck = 0; return; }
    actor.repath -= dt;
    if (actor.repath <= 0) { actor.path = findPath(actor, goal); actor.repath = .8 + this.random() * .4; }
    while (actor.path.length && dist(actor, actor.path[0]) < (actor.path.length === 1 ? arrival : .22)) actor.path.shift();
    const point = actor.path[0]; if (!point) return;
    const dx = point.x - actor.x, dz = point.z - actor.z, d = Math.hypot(dx, dz);
    const before = copy(actor), step = Math.min(d, speed * dt);
    moveBody(actor, dx / d * step, dz / d * step, .32);
    actor.moving = dist(before, actor) > .002;
    if (actor.moving) actor.yaw = Math.atan2(-dx, -dz);
    actor.stuck = actor.moving ? 0 : actor.stuck + dt;
    if (actor.stuck > .65) { actor.path = []; actor.repath = 0; actor.stuck = 0; }
  }
  aiFire(actor, target, dt, friendly) {
    // Every round, including the middle of a burst, needs a fresh muzzle ray.
    const muzzle = actor.crouch ? .85 : 1.4, targetHeight = target.crouch ? .78 : 1.2;
    if (!visible(actor, target, muzzle, targetHeight)) return;
    if (friendly) actor.cooldown -= dt;
    actor.yaw = Math.atan2(actor.x - target.x, actor.z - target.z);
    if (actor.cooldown > 0 || (!friendly && (actor.reload || !actor.ammo || actor.aimTime < .38))) return;
    if (friendly) actor.cooldown = .65 + this.random() * .3;
    else {
      if (!actor.burst) actor.burst = 2 + Math.floor(this.random() * 2);
      actor.ammo--; actor.burst--;
      actor.cooldown = actor.burst ? .14 : 1.4 + this.random() * .6;
      if (!actor.ammo) { actor.reload = 2.8; actor.burst = 0; this.emit('ai-reload', { from: { ...copy(actor), y: muzzle } }); }
    }
    const d = dist(actor, target);
    let chance = friendly ? .73 : clamp(.46 - d * .012, .14, .4);
    if (target === this.player) chance *= target.sprint ? .65 : target.crouch ? .7 : 1;
    const hit = this.random() < chance;
    const from = { x: actor.x, y: muzzle, z: actor.z };
    const aim = { x: target.x + (hit ? 0 : (this.random() < .5 ? -1 : 1) * (.6 + this.random() * .6)), y: targetHeight, z: target.z };
    const length = Math.hypot(aim.x - from.x, aim.y - from.y, aim.z - from.z);
    const direction = { x: (aim.x - from.x) / length, y: (aim.y - from.y) / length, z: (aim.z - from.z) / length };
    const range = wallDistance(from, direction, length);
    this.emit('shot', { faction: friendly ? 'friend' : 'enemy', from, to: { x: from.x + direction.x * range, y: from.y + direction.y * range, z: from.z + direction.z * range }, hit: false });
    this.noise(actor, 25, friendly ? 'friend' : 'enemy');
    if (hit) this.damage(target, friendly ? 24 : 9, actor);
  }
  enemyCombat(e, seen, dt) {
    e.moving = false;
    if (e.cover && (!protects(e.cover.hide, e.lastSeen) || e.coverTravel > 5)) {
      e.cover = null; e.tactic = 'observe'; e.coverRetry = 0; e.crouch = false;
    }
    if (!e.cover && e.coverRetry <= 0) {
      const occupied = this.enemies.filter(a => a !== e && a.hp > 0 && a.cover).map(a => a.cover.hide);
      e.cover = chooseCover(e, e.lastSeen, occupied); e.coverRetry = 1.5;
      if (e.cover) { e.tactic = 'move'; e.coverTravel = 0; e.repath = 0; e.path = []; }
    }
    const changeTactic = (tactic, seconds = 0) => { e.tactic = tactic; e.tacticTime = seconds; e.repath = 0; e.path = []; e.aimTime = 0; e.burst = 0; };
    if (e.cover) {
      e.tacticTime -= dt;
      if (e.tactic === 'move' || e.tactic === 'return') {
        e.crouch = false; e.coverTravel += dt;
        this.navigate(e, e.cover.hide, 3.6, dt, .08);
        if (dist(e, e.cover.hide) < .09) { e.coverTravel = 0; e.crouch = true; changeTactic('hide', 1.1 + this.random() * 1.1); }
        return;
      }
      if (e.tactic === 'hide') {
        e.crouch = true;
        e.yaw = Math.atan2(e.x - e.lastSeen.x, e.z - e.lastSeen.z);
        if (e.tacticTime <= 0 && !e.reload && e.pressure <= 0) { e.crouch = false; changeTactic('peek', 1.65); }
        return;
      }
      e.crouch = false;
      if (e.pressure > 0 || e.reload || e.tacticTime <= 0) { changeTactic('return'); return; }
      this.navigate(e, e.cover.peek, 2.1, dt, .08);
      if (dist(e, e.cover.peek) >= .09) { e.tacticTime += dt; e.coverTravel += dt; return; }
      e.coverTravel = 0;
    }
    // No suitable cover: return fire from a planted stance while reassessing.
    // If visual contact was lost, never substitute a live actor for memory.
    if (!seen) { e.aimTime = 0; e.burst = 0; e.targetId = null; return; }
    const targetId = seen.id || 'player';
    if (e.targetId !== targetId) { e.targetId = targetId; e.aimTime = 0; e.burst = 0; }
    e.aimTime += dt;
    this.aiFire(e, seen, dt, false);
  }
  tick(dt, input = {}) {
    if (this.status !== 'playing') return;
    dt = Math.min(dt, .05); this.time += dt;
    this.noises = this.noises.filter(n => n.expires > this.time);
    const p = this.player;
    p.cooldown = Math.max(0, p.cooldown - dt); p.hurt = Math.max(0, p.hurt - dt * .6);
    p.crouch = !!input.crouch; p.aim = !!input.aim;
    const moving = !!(input.forward || input.side);
    if (p.stamina <= 4) p.exhausted = true;
    if (p.stamina > 25) p.exhausted = false;
    p.sprint = !!input.sprint && moving && !p.crouch && !p.aim && !p.reload && !p.heal && !p.exhausted;
    p.stamina = clamp(p.stamina + dt * (p.sprint ? -20 : 14), 0, 100);
    if (p.reload > 0) { p.reload = Math.max(0, p.reload - dt); if (!p.reload) { const n = Math.min(30 - p.ammo, p.reserve); p.ammo += n; p.reserve -= n; this.emit('reload-done'); } }
    if (p.heal > 0) { p.heal = Math.max(0, p.heal - dt); if (!p.heal) { p.hp = Math.min(100, p.hp + 65); p.medkits--; this.radio('LEAD: Patched. Moving.'); } }
    const speed = p.heal ? .8 : p.crouch ? 1.65 : p.sprint ? 5.5 : p.aim ? 2 : 3.3;
    const f = input.forward || 0, s = input.side || 0, n = Math.max(1, Math.hypot(f, s));
    const dx = (-Math.sin(p.yaw) * f + Math.cos(p.yaw) * s) / n * speed * dt;
    const dz = (-Math.cos(p.yaw) * f - Math.sin(p.yaw) * s) / n * speed * dt;
    const before = copy(p); moveBody(p, dx, dz);
    p.moving = dist(before, p) > .001;
    if (p.moving) {
      p.step -= dt;
      if (p.step <= 0) { p.step = p.sprint ? .28 : p.crouch ? .62 : .45; this.noise(p, p.sprint ? 13 : p.crouch ? 2.8 : 6); this.emit('step', { soft: p.crouch }); }
    }
    if (this.stage === 'infiltrate' && p.z < 15 && Math.abs(p.x) < 18) { this.stage = 'locate'; this.radio('VALE: Holding building is northeast. Warm light at the door.'); }
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.cooldown = Math.max(0, e.cooldown - dt); e.coverRetry -= dt; e.pressure = Math.max(0, e.pressure - dt);
      if (e.reload > 0) { e.reload = Math.max(0, e.reload - dt); if (!e.reload) e.ammo = 30; }
      const targets = [p, ...this.friends].filter(a => a.hp > 0).sort((a, b) => dist(e, a) - dist(e, b));
      let seen = null;
      for (const t of targets) {
        const d = dist(e, t), limit = t === p ? p.light ? 28 : p.crouch ? 15 : 20 : 20;
        const front = ((t.x - e.x) * -Math.sin(e.yaw) + (t.z - e.z) * -Math.cos(e.yaw)) / Math.max(d, .01);
        if (d < limit && (e.state === 'combat' || e.state === 'alerted' || front > .25 || d < 4) && visible(e, t, e.crouch ? 1.02 : 1.6, t.crouch ? .85 : 1.3)) { seen = t; break; }
      }
      const sound = this.noises.find(n => n.faction !== 'enemy' && dist(e, n) < n.range * (visible(e, n) ? 1 : .4));
      if (seen) {
        e.awareness = Math.min(1, e.awareness + dt * (dist(e, seen) < 8 ? 2.4 : .9));
        e.lastSeen = { ...copy(seen), crouch: !!seen.crouch }; e.memory = 9;
        if (e.awareness >= 1 || e.state === 'combat') {
          if (e.state !== 'combat') this.emit('alert');
          e.state = 'combat'; this.enemyCombat(e, seen, dt);
          // Only allies who can see the caller receive the last known position.
          for (const ally of this.enemies) if (ally.hp > 0 && ally !== e && ally.state === 'patrol' && dist(e, ally) < 13 && visible(e, ally)) { ally.state = 'alerted'; ally.lastSeen = copy(seen); ally.memory = 8; }
          continue;
        }
        e.state = 'suspicious'; e.yaw = Math.atan2(e.x - seen.x, e.z - seen.z);
      } else {
        e.awareness = Math.max(0, e.awareness - dt * .25);
        e.aimTime = 0; e.burst = 0; e.targetId = null;
        if (e.state === 'combat' && e.cover && e.memory > 0) {
          if (sound) { e.lastSeen = copy(sound); e.memory = 7; }
          e.memory -= dt; this.enemyCombat(e, null, dt); continue;
        }
        if (e.state === 'combat') { e.state = 'search'; e.cover = null; e.crouch = false; e.tactic = 'observe'; e.repath = 0; }
      }
      if (sound && !seen) { e.lastSeen = copy(sound); e.memory = 7; if (e.state === 'patrol') e.state = 'suspicious'; }
      if (e.state !== 'patrol') {
        e.memory -= dt;
        if (e.memory <= 0) { e.state = 'patrol'; e.lastSeen = null; e.cover = null; e.crouch = false; e.tactic = 'observe'; e.repath = 0; }
        else if (!seen && e.lastSeen) {
          this.navigate(e, e.lastSeen, e.state === 'suspicious' ? 1.4 : 2.1, dt);
          if (dist(e, e.lastSeen) < 1) { e.state = 'search'; e.yaw += dt * .8; }
        }
      }
      if (e.state === 'patrol') {
        const goal = e.patrol[e.waypoint]; this.navigate(e, goal, 1.15, dt);
        if (dist(e, goal) < .65) { e.waypoint = (e.waypoint + 1) % e.patrol.length; e.repath = 0; }
      }
    }
    this.friends.forEach((friend, i) => {
      if (friend.hp <= 0) return;
      const target = this.enemies.filter(e => e.hp > 0 && dist(friend, e) < 25 && visible(friend, e, 1.55, e.crouch ? .78 : 1.25)).sort((a, b) => dist(friend, a) - dist(friend, b))[0];
      const offset = i ? 1.6 : -1.6;
      const goal = friend.mode === 'hold' ? friend.hold : { x: p.x + Math.cos(p.yaw) * offset + Math.sin(p.yaw) * 2.7, z: p.z - Math.sin(p.yaw) * offset + Math.cos(p.yaw) * 2.7 };
      this.navigate(friend, goal || friend, dist(friend, p) > 8 ? 5.4 : 3.5, dt);
      // Friendlies yield without applying collision impulses to the player.
      const d = dist(friend, p);
      if (d < 1.15 && d > .01) moveBody(friend, (friend.x - p.x) / d * dt * 2, (friend.z - p.z) / d * dt * 2);
      const other = this.friends[1 - i], separation = dist(friend, other);
      if (separation < .7 && separation > .01) moveBody(friend, (friend.x - other.x) / separation * dt, (friend.z - other.z) / separation * dt);
      if (target) this.aiFire(friend, target, dt, true);
    });
    const interact = this.interactionTarget();
    if (input.interact && interact && !p.heal) {
      if (this.interactionKey !== interact.key) { this.interaction = 0; this.interactionKey = interact.key; }
      this.interaction += dt;
      if (this.interaction >= interact.duration) {
        if (interact.key === 'hostage') { this.hostage.freed = true; this.stage = 'extract'; this.radio('ELIAN: I can walk. Get me to that boat.'); }
        else { interact.actor.hp = 60; this.radio(`${interact.actor.name}: Back up. Thank you, Lead.`); }
        this.interaction = 0;
      }
    } else { this.interaction = 0; this.interactionKey = ''; }
    if (this.hostage.freed) {
      if (dist(this.hostage, p) > 2.2) this.navigate(this.hostage, p, dist(this.hostage, p) > 10 ? 4.2 : 3.1, dt);
      else this.hostage.moving = false;
      const near = dist(p, EXTRACT) < 5 && dist(this.hostage, EXTRACT) < 6;
      const clear = !this.enemies.some(e => e.hp > 0 && dist(e, EXTRACT) < 12 && visible(e, EXTRACT));
      this.extraction = near && clear ? this.extraction + dt : 0;
      if (this.extraction > 3 && this.status === 'playing') { this.status = 'won'; this.emit('end'); }
    }
  }
}
