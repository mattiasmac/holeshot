/* ===================== storage adapter ===================== */
const Store = (function () {
  const mem = {};
  let lsOk = null;
  const ws = () => (typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function') ? window.storage : null;
  function ls() {
    if (lsOk === null) { try { localStorage.setItem('__hs_t', '1'); localStorage.removeItem('__hs_t'); lsOk = true; } catch (e) { lsOk = false; } }
    return lsOk ? localStorage : null;
  }
  const mk = (key, shared) => (shared ? 'shared:' : '') + key;
  async function get(key, shared) {
    const k = mk(key, shared);
    const w = ws();
    if (w) { try { const r = await w.get(key, !!shared); if (r && r.value) { const v = JSON.parse(r.value); mem[k] = v; return v; } } catch (e) { /* missing key or bridge error: fall through */ } }
    const l = ls();
    if (l) { try { const v = l.getItem(k); if (v) { const o = JSON.parse(v); mem[k] = o; return o; } } catch (e) {} }
    return mem[k] || null;
  }
  async function set(key, val, shared) {
    const k = mk(key, shared); mem[k] = val;
    const str = JSON.stringify(val);
    const w = ws();
    if (w) { try { const r = await w.set(key, str, !!shared); if (r) return true; } catch (e) {} }
    const l = ls();
    if (l) { try { l.setItem(k, str); return true; } catch (e) {} }
    return false;
  }
  // The host may inject window.storage a moment after the page starts: give it a chance before loading the profile.
  async function ready(maxMs) { const t0 = Date.now(); while (!ws() && !ls() && Date.now() - t0 < (maxMs || 1500)) await new Promise(r => setTimeout(r, 50)); }
  return { get, set, ready, get kind() { return ws() ? 'shared' : (ls() ? 'local' : 'memory'); } };
})();

/* ===================== audio ===================== */
const Sfx = (function () {
  let ctx = null, master, engine = null, enabled = true, unlocked = false;
  // Output route. 'element': the whole mix is piped through an <audio> element via a MediaStream, which iOS
  // treats as media playback (plays with the silent switch on). 'direct': straight to the speaker (lowest latency).
  let out = null, routeEl = null, routed = 'none', routePref = 'media';
  const PROFILES = {
    i4:       { cyl: 4, saw: 0.5, sq: 0.25, sub: 0.2, noise: 0.10, bright: 1.6, jitter: 0.01 },
    v6:       { cyl: 6, saw: 0.5, sq: 0.25, sub: 0.25, noise: 0.14, bright: 1.4, jitter: 0.012 },
    v8:       { cyl: 8, saw: 0.55, sq: 0.35, sub: 0.35, noise: 0.16, bright: 1.1, jitter: 0.03 },
    v8sc:     { cyl: 8, saw: 0.55, sq: 0.35, sub: 0.35, noise: 0.22, bright: 1.2, jitter: 0.03, whine: 0.08 },
    flat8:    { cyl: 8, saw: 0.6, sq: 0.2, sub: 0.2, noise: 0.14, bright: 1.9, jitter: 0.006 },
    prostock: { cyl: 8, saw: 0.6, sq: 0.35, sub: 0.3, noise: 0.24, bright: 1.7, jitter: 0.02 },
    blown:    { cyl: 8, saw: 0.55, sq: 0.4, sub: 0.45, noise: 0.35, bright: 1.1, jitter: 0.03, whine: 0.14 },
    nitro:    { cyl: 8, saw: 0.5, sq: 0.5, sub: 0.6, noise: 0.6, bright: 0.9, jitter: 0.05, whine: 0.06 },
    ev:       { cyl: 0, saw: 0, sq: 0, sub: 0, noise: 0.05, bright: 3, jitter: 0, whine: 0.12 },
  };
  function init() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = enabled ? 0.55 : 0;
      if (routePref === 'media') routeThroughElement(); else fallbackDirect();
      return true;
    } catch (e) { return false; }
  }
  function routeThroughElement() {
    if (routed === 'element' || routed === 'pending') return;
    try {
      if (!ctx.createMediaStreamDestination) throw new Error('no stream dest');
      fallbackUndo();
      out = ctx.createMediaStreamDestination(); master.connect(out);
      routeEl = document.createElement('audio'); routeEl.setAttribute('playsinline', ''); routeEl.setAttribute('webkit-playsinline', ''); routeEl.setAttribute('x-webkit-airplay', 'deny');
      routeEl.autoplay = false; routeEl.srcObject = out.stream; routeEl.style.display = 'none'; document.body.appendChild(routeEl);
      routed = 'pending';
      const ok = () => { if (routed === 'pending') routed = 'element'; };
      routeEl.addEventListener('playing', ok);
      const pr = routeEl.play(); if (pr && pr.then) pr.then(ok).catch(() => { if (routed === 'pending') fallbackDirect(); });
      setTimeout(() => { if (routed === 'pending') fallbackDirect(); }, 2500);
    } catch (e) { fallbackDirect(); }
  }
  function fallbackUndo() { try { if (out) master.disconnect(out); } catch (e) {} try { if (routeEl) { routeEl.pause(); routeEl.srcObject = null; routeEl.remove(); } } catch (e) {} out = null; routeEl = null; }
  function fallbackDirect() { if (routed === 'direct') return; fallbackUndo(); try { master.connect(ctx.destination); } catch (e) {} routed = 'direct'; }
  function setRoute(pref) { routePref = pref; if (!ctx) return; if (pref === 'direct') { try { master.disconnect(); } catch (e) {} routed = 'none'; fallbackDirect(); } else { try { master.disconnect(); } catch (e) {} routed = 'none'; routeThroughElement(); } }
  // iOS mutes Web Audio under the silent switch unless a media element is playing: keep a silent <audio> looping.
  const SILENCE = 'data:audio/wav;base64,UklGRqQMAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YYAMAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
  let silent = null, silentOk = false;
  function keepAlive() {
    try {
      if (!silent) { silent = document.createElement('audio'); silent.setAttribute('playsinline', ''); silent.setAttribute('webkit-playsinline', ''); silent.setAttribute('x-webkit-airplay', 'deny'); silent.preload = 'auto'; silent.loop = true; silent.src = SILENCE; silent.style.display = 'none'; document.body.appendChild(silent); }
      if (!silentOk || silent.paused) { const pr = silent.play(); if (pr && pr.then) pr.then(() => { silentOk = true; }).catch(() => {}); }
    } catch (e) {}
  }
  function unlock() {
    keepAlive(); if (!init()) return;
    if (ctx.state !== 'running') { try { ctx.resume().catch(() => {}); } catch (e) {} }
    if (routePref === 'media' && routed === 'direct' && !retriedRoute) { retriedRoute = true; try { master.disconnect(); } catch (e) {} routed = 'none'; routeThroughElement(); }
    if (routeEl && routeEl.paused && routed !== 'direct') { try { const pr = routeEl.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {} }
    unlocked = true;
  }
  let retriedRoute = false;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (silent) keepAlive(); if (ctx && ctx.state !== 'running') { try { ctx.resume().catch(() => {}); } catch (e) {} } if (routeEl && routeEl.paused) { try { routeEl.play().catch(() => {}); } catch (e) {} } } else if (silent) { try { silent.pause(); } catch (e) {} } });
  }
  function setEnabled(on) { enabled = on; if (master) master.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.02); }
  function noiseBuffer() {
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  let nb = null;
  function startEngine(profileName) {
    if (!init()) return; stopEngine();
    const p = PROFILES[profileName] || PROFILES.v8;
    const e = { p };
    e.out = ctx.createGain(); e.out.gain.value = 0;
    e.filter = ctx.createBiquadFilter(); e.filter.type = 'lowpass'; e.filter.frequency.value = 400; e.filter.Q.value = 0.8;
    e.filter.connect(e.out); e.out.connect(master);
    e.gate = ctx.createGain(); e.gate.gain.value = 1; e.gate.connect(e.filter);
    const mk = (type, gain) => { const o = ctx.createOscillator(); o.type = type; const g = ctx.createGain(); g.gain.value = gain; o.connect(g); g.connect(e.gate); o.start(); return { o, g }; };
    if (p.saw) e.saw = mk('sawtooth', p.saw);
    if (p.sq) e.sq = mk('square', p.sq);
    if (p.sub) e.sub = mk('sine', p.sub);
    if (p.whine) { e.whine = mk('triangle', p.whine); }
    // exhaust roar noise
    nb = nb || noiseBuffer();
    e.noise = ctx.createBufferSource(); e.noise.buffer = nb; e.noise.loop = true;
    e.nf = ctx.createBiquadFilter(); e.nf.type = 'bandpass'; e.nf.frequency.value = 300; e.nf.Q.value = 0.7;
    e.ng = ctx.createGain(); e.ng.gain.value = p.noise;
    e.noise.connect(e.nf); e.nf.connect(e.ng); e.ng.connect(e.gate); e.noise.start();
    e.lastGate = 1;
    engine = e;
  }
  function stopEngine() {
    if (!engine) return;
    const e = engine; engine = null;
    try { e.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } catch (err) {}
    setTimeout(() => { try { [e.saw, e.sq, e.sub, e.whine].forEach(x => x && x.o.stop()); e.noise.stop(); } catch (err) {} }, 300);
  }
  // rpm, throttle 0..1, limiter bool, loud 0..1
  function updateEngine(rpm, throttle, limiter, speedMph) {
    if (!engine || !ctx) return;
    const e = engine, p = e.p, t = ctx.currentTime;
    const fire = p.cyl ? (rpm / 60) * (p.cyl / 2) : rpm / 60 * 0.5;
    const jit = 1 + (Math.random() * 2 - 1) * p.jitter;
    if (e.saw) e.saw.o.frequency.setTargetAtTime(Math.max(20, fire * jit), t, 0.02);
    if (e.sq) e.sq.o.frequency.setTargetAtTime(Math.max(10, fire * 0.5 * jit), t, 0.02);
    if (e.sub) e.sub.o.frequency.setTargetAtTime(Math.max(10, fire * 0.25), t, 0.03);
    if (e.whine) e.whine.o.frequency.setTargetAtTime(Math.max(40, fire * (p.cyl ? 6 : 24)), t, 0.03);
    const cutoff = 250 + rpm * 0.45 * p.bright * (0.5 + 0.5 * throttle);
    e.filter.frequency.setTargetAtTime(Math.min(9000, cutoff), t, 0.03);
    e.nf.frequency.setTargetAtTime(150 + rpm * 0.25 + speedMph * 8, t, 0.05);
    e.ng.gain.setTargetAtTime(p.noise * (0.35 + 0.65 * throttle), t, 0.05);
    const vol = 0.35 + 0.65 * throttle;
    e.out.gain.setTargetAtTime(vol, t, 0.04);
    // rev-limiter stutter: gate on/off ~28 Hz
    const gate = limiter ? ((Math.floor(t * 28) % 2) ? 1 : 0.15) : 1;
    if (gate !== e.lastGate) { e.gate.gain.setTargetAtTime(gate, t, 0.004); e.lastGate = gate; }
  }
  function oneShot(fn) { if (!init()) return; try { fn(); } catch (e) {} }
  function tireChirp(len, gain) {
    oneShot(() => {
      nb = nb || noiseBuffer();
      const src = ctx.createBufferSource(); src.buffer = nb;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
      const g = ctx.createGain(); const t = ctx.currentTime;
      f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(1400, t + len);
      g.gain.setValueAtTime(gain || 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(f); f.connect(g); g.connect(master); src.start(); src.stop(t + len + 0.05);
    });
  }
  function shiftClack(clutchless) {
    oneShot(() => {
      nb = nb || noiseBuffer();
      const src = ctx.createBufferSource(); src.buffer = nb;
      const f = ctx.createBiquadFilter(); f.type = clutchless ? 'highpass' : 'bandpass'; f.frequency.value = clutchless ? 3000 : 900; f.Q.value = 1.5;
      const g = ctx.createGain(); const t = ctx.currentTime, len = clutchless ? 0.09 : 0.14;
      g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(f); f.connect(g); g.connect(master); src.start(); src.stop(t + len + 0.05);
    });
  }
  function beep(freq, len, gain, type) {
    oneShot(() => {
      const o = ctx.createOscillator(); o.type = type || 'square'; o.frequency.value = freq;
      const g = ctx.createGain(); const t = ctx.currentTime;
      g.gain.setValueAtTime(gain || 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      o.connect(g); g.connect(master); o.start(); o.stop(t + len + 0.02);
    });
  }
  function winHorn() { beep(660, 0.18, 0.18, 'triangle'); setTimeout(() => beep(880, 0.35, 0.18, 'triangle'), 160); }
  function foulBuzz() { beep(110, 0.5, 0.25, 'sawtooth'); }
  function stageClick() { beep(1400, 0.05, 0.08, 'sine'); }
  function testTone() { unlock(); beep(440, 0.15, 0.25, 'triangle'); setTimeout(() => beep(660, 0.25, 0.25, 'triangle'), 180); }
  function status() { return !ctx ? 'not started (tap something first)' : `${ctx.state}, route: ${routed === 'element' ? 'media player' : routed === 'direct' ? 'direct' : routed}`; }
  return { init, unlock, setEnabled, setRoute, status, testTone, startEngine, stopEngine, updateEngine, tireChirp, shiftClack, winHorn, foulBuzz, stageClick, get unlocked() { return unlocked; } };
})();
