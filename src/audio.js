// Original synthesized audio; no downloaded recordings or runtime services.
export class FieldAudio {
  constructor() { this.volume = .65; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
    const length = this.ctx.sampleRate * 3;
    this.buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.buffer.getChannelData(0); let last = 0;
    for (let i = 0; i < length; i++) { last = (last + (Math.random() * 2 - 1) * .08) / 1.08; data[i] = last * 3; }
    const surf = this.ctx.createBufferSource(); surf.buffer = this.buffer; surf.loop = true;
    const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 550;
    this.ambient = this.ctx.createGain(); this.ambient.gain.value = .11;
    surf.connect(filter); filter.connect(this.ambient); this.ambient.connect(this.master); surf.start();
    const lfo = this.ctx.createOscillator(), depth = this.ctx.createGain(); lfo.frequency.value = .13; depth.gain.value = .035;
    lfo.connect(depth); depth.connect(this.ambient.gain); lfo.start();
  }
  setVolume(value) { this.volume = value; if (this.master) this.master.gain.value = value; }
  pause(paused) { if (this.ctx) paused ? this.ctx.suspend() : this.ctx.resume(); }
  listener(p) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = 1.6; l.positionZ.value = p.z;
      l.forwardX.value = -Math.sin(p.yaw); l.forwardY.value = 0; l.forwardZ.value = -Math.cos(p.yaw);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(p.x, 1.6, p.z); l.setOrientation(-Math.sin(p.yaw), 0, -Math.cos(p.yaw), 0, 1, 0); }
  }
  burst(duration, volume, freq, position) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const source = this.ctx.createBufferSource(); source.buffer = this.buffer;
    const filter = this.ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = .7;
    const gain = this.ctx.createGain(), now = this.ctx.currentTime;
    gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    source.connect(filter); filter.connect(gain);
    if (position) {
      const pan = this.ctx.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 4; pan.maxDistance = 90; pan.rolloffFactor = 1;
      pan.setPosition(position.x, position.y || 1.4, position.z); gain.connect(pan); pan.connect(this.master);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect(); };
    } else { gain.connect(this.master); source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); }; }
    source.start(now, Math.random()); source.stop(now + duration);
  }
  tone(freq, duration, volume = .08) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain(), t = this.ctx.currentTime;
    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t); osc.frequency.exponentialRampToValueAtTime(freq * .6, t + duration);
    gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(.001, t + duration);
    osc.connect(gain); gain.connect(this.master); osc.start(); osc.stop(t + duration);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  event(e) {
    if (e.type === 'shot') { this.burst(.19, e.faction === 'player' ? .9 : .75, e.faction === 'player' ? 900 : 1600, e.faction === 'player' ? null : e.from); if (e.faction === 'player') this.tone(95, .13, .13); }
    if (e.type === 'step') this.burst(.12, e.soft ? .09 : .18, 290);
    if (e.type === 'reload') { this.burst(.18, .22, 1800); }
    if (e.type === 'reload-done') this.burst(.15, .3, 2200);
    if (e.type === 'ai-reload') this.burst(.2, .2, 1800, e.from);
    if (e.type === 'hit') this.tone(1050, .045, .035);
    if (e.type === 'empty') this.burst(.035, .13, 3300);
    if (e.type === 'hurt') { this.tone(65, .25, .24); this.burst(.15, .3, 500); }
    if (e.type === 'radio') this.burst(.12, .07, 2800);
    if (e.type === 'alert') this.tone(420, .12, .035);
  }
}
