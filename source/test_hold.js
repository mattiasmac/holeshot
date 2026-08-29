// One continuous press: down on STAGE, keep holding through staging and the tree, release on the amber.
const fs = require('fs'); const PH = require('./10_physics.js'); global.PH = PH;
let nowMs = 0; global.performance = { now: () => nowMs };
global.window = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, addEventListener() {} };
global.localStorage = { _m: {}, getItem(k) { return this._m[k] === undefined ? null : this._m[k]; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };
global.document = { querySelector() { return null; }, createElement() { return { style: {}, getBoundingClientRect() { return { top: 0, left: 0, right: 390, bottom: 844 }; }, remove() {} }; }, body: { appendChild() {} }, addEventListener() {}, documentElement: {} };
const timers = []; global.setTimeout = (fn, ms) => { timers.push({ at: nowMs + ms, fn }); return timers.length; }; global.clearTimeout = () => {};
let frameFn = null; global.requestAnimationFrame = (fn) => { frameFn = fn; return 1; }; global.cancelAnimationFrame = () => {};
global.R = { W: 390, H: 844, particles: [], stepParticles() {}, spawnSmoke() {}, drawScene() {}, attach() {}, resize() {}, clear() {} };
const src = fs.readFileSync('20_store_audio.js', 'utf8') + '\n' + fs.readFileSync('40_game.js', 'utf8');
const { Game } = new Function('PH', 'R', src + '\n; return { Game };')(PH, global.R);
let slip = null, phases = [], coachMsgs = [];
const ui = { safe: { top: 0, left: 0, right: 0, bottom: 0 }, enterRace() {}, leaveRace() {}, phase(p) { phases.push(p); }, coach(m) { if (m) coachMsgs.push(m); }, showSlip(res) { slip = res; } };
(async () => {
  await Game.load(); Game.setUI(ui); Game.P.car = 'gt'; Game.P.owned.push('gt');
  const spec = Game.specFor('gt'); const run = PH.newRun(spec); run.tireHeat = 1; PH.launch(run, 0); let tt = 0; while (run.beamExitT === null) { PH.step(run, 1 / 500, tt); tt += 1 / 500; } const rolloutT = run.beamExitT;
  Game.start({ mode: 'quick' }); const race = Game.race; const evt = () => ({ timeStamp: nowMs }); const dt = 1000 / 60;
  Game.skipBurnout();
  let pressed = false, released = false, guard = 0, creepLog = [];
  while (!slip && guard++ < 8000) {
    nowMs += dt;
    if (race.phase === 'staging' && !pressed) { pressed = true; Game.leftDown(evt()); }   // press STAGE and never let go
    if (race.phase === 'staging' && guard % 15 === 0) creepLog.push(race.player.creep.toFixed(2));
    if (race.phase === 'tree' && !released) { const rel = race.player.green - rolloutT + 0.012; if (race.clock >= rel) { Game.leftUp(evt()); released = true; } }
    if (race.phase === 'run') { const pr = race.player.run; if (pr.gear < spec.gears.length - 1 && pr.shifting === 0 && !pr.spinning && pr.rpm >= spec.optShift[pr.gear] - 30) Game.rightDown(evt()); }
    frameFn(nowMs);
    for (const tm of timers.splice(0)) if (nowMs >= tm.at) tm.fn(); else timers.push(tm);
  }
  console.log('phases:', phases.join('>'));
  console.log('creep during staging:', creepLog.join(' '));
  console.log('tree armed', race.autostartAt !== null, '| RT', PH.fmtT(slip.rt), 'foul', slip.foul, '| ET', PH.fmtT(slip.run.et), '|', slip.win ? 'WIN' : 'LOSS');
  console.log('coach:', coachMsgs.join(' / '));
})();
