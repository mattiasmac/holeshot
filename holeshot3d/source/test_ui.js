// Drives the actual UI event handlers (pointerdown/pointerup on the LAUNCH button) through a fake DOM.
const fs = require('fs');
const PH = require('./10_physics.js'); global.PH = PH;
let nowMs = 0; global.performance = { now: () => nowMs };
const timers = []; global.setTimeout = (fn, ms) => { timers.push({ at: nowMs + (ms || 0), fn }); return timers.length; }; global.clearTimeout = () => {};
let frameFn = null; global.requestAnimationFrame = (fn) => { frameFn = fn; return 1; }; global.cancelAnimationFrame = () => {};
const ctxProxy = new Proxy({}, { get(t, k) { if (['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'font', 'textAlign', 'textBaseline', 'shadowBlur', 'shadowColor', 'lineCap'].includes(k)) return t[k]; return () => ({ addColorStop() {} }); }, set(t, k, v) { t[k] = v; return true; } });
class El {
  constructor(id) { this.id = id || ''; this._cls = new Set(); this.style = {}; this.dataset = {}; this.innerHTML = ''; this.textContent = ''; this._h = {}; this.children = []; this.checked = false; this.value = ''; this.width = 100; this.height = 100;
    this.classList = { add: (c) => this._cls.add(c), remove: (c) => this._cls.delete(c), toggle: (c, on) => { if (on === undefined) on = !this._cls.has(c); on ? this._cls.add(c) : this._cls.delete(c); }, contains: (c) => this._cls.has(c) }; }
  addEventListener(t, fn) { (this._h[t] = this._h[t] || []).push(fn); }
  removeEventListener() {}
  dispatch(t, e) { e = Object.assign({ type: t, target: this, currentTarget: this, cancelable: true, preventDefault() {}, timeStamp: nowMs, pointerId: 1, closest: () => null }, e || {}); (this._h[t] || []).forEach(fn => fn(e)); if (t === 'click' && this.onclick) this.onclick(e); return e; }
  setPointerCapture() {} getContext() { return ctxProxy; } querySelectorAll() { return []; } querySelector() { return new El(); }
  appendChild(c) { this.children.push(c); return c; } remove() {} getBoundingClientRect() { return { top: 0, left: 0, right: 390, bottom: 844 }; }
  setAttribute() {} focus() {}
}
const reg = {};
const byId = (id) => reg[id] || (reg[id] = new El(id));
['stage', 'menuTree', 'menuCar', 'mChalSub', 'mRaceSub', 'saveNote', 'menu', 'race', 'slip', 'paper', 'toast', 'btnL', 'btnR', 'quitBtn', 'skipBtn', 'coach', 'howSkip', 'howGo', 'howto', 'mRace', 'mModes', 'mGarage', 'mChal', 'mLB', 'mHow', 'mSettings', 'dialMinus', 'dialPlus', 'dialGo', 'dialVal', 'setName', 'resetBtn', 'storageNote', 'testSound', 'audioStatus'].forEach(byId);
const screens = ['menu', 'modes', 'dial', 'garage', 'challenges', 'leaderboard', 'settings', 'howto'].map(byId);
global.document = {
  querySelector: (sel) => { const m = sel.match(/^#([\w-]+)$/); if (m) return byId(m[1]); return new El(); },
  querySelectorAll: (sel) => { if (sel === '.screen') return screens; return []; },
  createElement: () => new El(), body: new El('body'), addEventListener() {}, removeEventListener() {}, documentElement: new El('html'), hidden: false,
};
global.window = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, addEventListener(t, fn) { (winH[t] = winH[t] || []).push(fn); }, scrollTo() {}, storage: undefined };
const winH = {};
global.localStorage = { _m: {}, getItem(k) { return this._m[k] === undefined ? null : this._m[k]; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };
global.navigator = {}; global.location = { protocol: 'file:' };
global.R = { W: 390, H: 844, particles: [], stepParticles() {}, spawnSmoke() {}, drawScene() {}, attach() {}, resize() {}, clear() {} };
const src = fs.readFileSync('20_store_audio.js', 'utf8') + '\n' + fs.readFileSync('40_game.js', 'utf8') + '\n' + fs.readFileSync('50_ui.js', 'utf8').replace(/Store\.ready\(1500\)[\s\S]*$/, '');
const { Game, UI } = new Function('PH', 'R', 'window', 'document', src + '\n; return { Game, UI };')(PH, global.R, global.window, global.document);
const runTimers = () => { for (const tm of timers.splice(0)) if (nowMs >= tm.at) tm.fn(); else timers.push(tm); };

(async () => {
  await Game.load(); UI.init();
  byId('mRace').dispatch('click');                                  // first time: how-to appears
  console.log('how-to shown first:', byId('howto').classList.contains('on'), '| checkbox default:', byId('howSkip').checked);
  byId('howGo').dispatch('click');                                  // "Got it — stage up" -> race starts
  const race = Game.race; console.log('race started:', !!race, '| tree:', race.treeType, '| seenHow saved:', Game.P.settings.seenHow);
  const spec = race.spec; const run = PH.newRun(spec); run.tireHeat = 1; PH.launch(run, 0); let tt = 0; while (run.beamExitT === null) { PH.step(run, 1 / 500, tt); tt += 1 / 500; } const rolloutT = run.beamExitT;
  const L = byId('btnL'), Rb = byId('btnR');
  byId('skipBtn').dispatch('click');
  const dt = 1000 / 60; let pressed = false, released = false, guard = 0, labels = new Set(), amberSeq = [];
  while (!byId('slip').classList.contains('on') && guard++ < 9000) {
    nowMs += dt; frameFn(nowMs); runTimers();
    labels.add(L.innerHTML.split('<')[0]);
    if (race.phase === 'staging' && !pressed) { pressed = true; L.dispatch('pointerdown'); }          // one press on STAGE, held
    if (race.phase === 'tree' && race.player.treeStart !== null) { const l = race.player.lights; const k = (l.a1 ? 'a1' : '') + (l.a2 ? 'a2' : '') + (l.a3 ? 'a3' : '') + (l.green ? 'G' : ''); if (k && amberSeq[amberSeq.length - 1] !== k) amberSeq.push(k); }
    if (race.phase === 'tree' && !released && race.clock >= race.player.green - rolloutT + 0.015) { released = true; L.dispatch('pointerup'); }  // let go on the amber
    if (race.phase === 'run') { const pr = race.player.run; if (pr.gear < spec.gears.length - 1 && pr.shifting === 0 && !pr.spinning && pr.rpm >= spec.optShift[pr.gear] - 30) Rb.dispatch('pointerdown'); }
  }
  const res = race.result;
  console.log('button labels seen:', [...labels].join(' | '));
  console.log('tree sequence:', amberSeq.join(' → '));
  console.log('launched on release:', res.run.launched, '| RT', PH.fmtT(res.rt), '| ET', PH.fmtT(res.run.et), '|', res.win ? 'WIN' : 'LOSS', '|', res.reason);
  // ---- second race: never let go ----
  byId('sMenu'); // (slip buttons are rendered into innerHTML in the real DOM; go straight to a new race)
  Game.stop(); byId('mRace').dispatch('click');
  console.log('how-to shown again:', byId('howto').classList.contains('on'));
  const r2 = Game.race; byId('skipBtn').dispatch('click'); guard = 0; pressed = false;
  while (!byId('slip').classList.contains('on') && guard++ < 12000) {
    nowMs += dt; frameFn(nowMs); runTimers();
    if (r2.phase === 'staging' && !pressed) { pressed = true; L.dispatch('pointerdown'); }   // hold... and never release
  }
  console.log('never-let-go ending:', r2.result.reason, '| launched:', r2.result.run.launched, '| rt:', r2.result.rt, '| lines:', JSON.stringify(r2.result.lines), '| AI ET', PH.fmtT(r2.result.aiRun.et));
})();
