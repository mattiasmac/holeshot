// Headless test: drives a full race through Game with stubs.
const fs = require('fs');
const PH = require('./10_physics.js');
global.PH = PH;
let nowMs = 0;
global.performance = { now: () => nowMs };
global.window = { storage: undefined, AudioContext: undefined, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, addEventListener() {} };
global.localStorage = { _m: {}, getItem(k) { return this._m[k] === undefined ? null : this._m[k]; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };
global.document = { querySelector() { return null; }, createElement() { return { style: {}, getBoundingClientRect() { return { top: 0, left: 0, right: 390, bottom: 844 }; }, remove() {} }; }, body: { appendChild() {} }, addEventListener() {}, documentElement: {} };
global.requestAnimationFrame = () => 1; global.cancelAnimationFrame = () => {};
global.setTimeout = (fn, ms) => { timers.push({ at: nowMs + ms, fn }); return timers.length; }; global.clearTimeout = () => {};
const timers = [];
const src = fs.readFileSync('20_store_audio.js', 'utf8') + '\n' + fs.readFileSync('40_game.js', 'utf8');
global.R = { W: 390, H: 844, particles: [], stepParticles() {}, spawnSmoke() {}, drawScene() {}, attach() {}, resize() {}, clear() {} };
const ctxFn = new Function('PH', 'R', src + '\n; return { Game, Store, Sfx };');
const { Game, Store, Sfx } = ctxFn(PH, global.R);
let phases = [], slip = null;
const ui = { safe: { top: 0, left: 0, right: 0 }, enterRace() {}, leaveRace() {}, phase(p) { phases.push(p); }, coach() {}, showSlip(res) { slip = res; } };

async function runRace(opts, plan) {
  await Game.load();
  Game.P.settings.difficulty = plan.diff || 'pro'; Game.P.settings.auto = !!plan.auto; Game.P.settings.tree = plan.tree || 'pro'; Game.P.car = plan.car || 'ctr'; Game.P.owned.push(plan.car || 'ctr');
  Game.setUI(ui); phases = []; slip = null;
  Game.start(opts);
  const race = Game.race;
  const step = 1 / 500;
  // simulate the frame loop manually: tick STEP repeatedly by advancing race via internal frame? use exposed tick through frame simulation
  // We emulate by calling the private loop: Game exposes nothing, so we drive via requestAnimationFrame replacement
  return race;
}
// Because tick() is private, re-create the driver by grabbing frame through requestAnimationFrame capture
let frameFn = null; global.requestAnimationFrame = (fn) => { frameFn = fn; return 1; };

async function drive(plan) {
  await runRace(plan.opts, plan);
  const race = Game.race;
  const evt = () => ({ timeStamp: nowMs });
  let t = 0; const dt = 1000 / 60; // ms per frame
  let released = false, shifted = 0, done = false, guard = 0;
  // burnout: hold 1.5 s then release, skip
  Game.leftDown(evt()); let burnT = 0;
  while (!slip && guard++ < 6000) {
    nowMs += dt; t += dt / 1000;
    if (race.phase === 'burnout') { burnT += dt / 1000; if (burnT > 1.4 && race.player.burning) { Game.leftUp(evt()); Game.skipBurnout(); } }
    if (race.phase === 'staging' && race.player.stageT === null) { Game.leftDown(evt()); Game.leftUp(evt()); }
    if ((race.phase === 'staged') && !race.player.holding && !race.player.run.launched) { Game.leftDown(evt()); }
    if (race.phase === 'tree' && !released && race.player.holding) {
      // release at the planned time relative to the player's green
      const rel = race.player.green - race.player.rolloutT_ + plan.rtOffset;
      if (race.clock >= rel) { Game.leftUp(evt()); released = true; }
    }
    if (race.phase === 'run' && !plan.auto) {
      const pr = race.player.run; const spec = race.spec;
      if (spec.trans !== 'none' && spec.trans !== 'single' && pr.gear < spec.gears.length - 1 && pr.shifting === 0 && !pr.spinning && pr.rpm >= spec.optShift[pr.gear] + plan.shiftErr) Game.rightDown(evt());
    }
    frameFn(nowMs);
    for (const tm of timers.splice(0)) if (nowMs >= tm.at) tm.fn(); else timers.push(tm);
  }
  return { race, slip, phases };
}
(async () => {
  // rollout time helper for the plan
  for (const plan of [
    { car: 'ctr', diff: 'pro', rtOffset: 0.03, shiftErr: -50, opts: { mode: 'quick' } },
    { car: 'gt', diff: 'elite', rtOffset: -0.05, shiftErr: 0, opts: { mode: 'quick' } },       // red light expected
    { car: 'prostock', diff: 'pro', rtOffset: 0.02, shiftErr: -80, opts: { mode: 'quick' } },
    { car: 'topfuel', diff: 'pro', rtOffset: 0.04, shiftErr: 0, opts: { mode: 'quick' } },
    { car: 'demon', diff: 'pro', auto: true, rtOffset: 0.05, shiftErr: 0, opts: { mode: 'clock', target: 9.2 } },
    { car: 'gt', diff: 'pro', rtOffset: 0.03, shiftErr: -50, opts: { mode: 'bracket', dial: 12.4 } },
  ]) {
    // compute the player's rollout time for this car using the physics
    const spec = Game.specFor(plan.car); const run = PH.newRun(spec); run.tireHeat = 1; PH.launch(run, 0); let tt = 0; while (run.beamExitT === null && tt < 3) { PH.step(run, 1 / 500, tt); tt += 1 / 500; }
    const rolloutT = run.beamExitT;
    Object.defineProperty(Object.prototype, 'rolloutT_', { get() { return rolloutT; }, configurable: true });
    const { race, slip, phases } = await drive(plan);
    const r = slip.run, a = slip.aiRun;
    console.log(`\n${plan.car} [${plan.opts.mode}/${plan.diff}${plan.auto ? '/auto' : ''}] phases: ${phases.join('>')}`);
    console.log(`  YOU  RT ${PH.fmtT(slip.rt)} foul=${slip.foul} 60=${PH.fmtT(r.splits[60])} ET=${PH.fmtT(r.et)} @ ${r.trapMph && r.trapMph.toFixed(1)} shifts=${r.shifts.map(s => s.grade).join(',')} spin=${r.spinTotal.toFixed(2)}`);
    if (!slip.solo) console.log(`  AI   RT ${PH.fmtT(slip.aiRt)} foul=${slip.aiFoul} 60=${PH.fmtT(a.splits[60])} ET=${PH.fmtT(a.et)} @ ${a.trapMph && a.trapMph.toFixed(1)}`);
    console.log(`  => ${slip.win ? 'WIN' : 'LOSS'} (${slip.reason}) holeshot=${slip.holeshot} pts=${slip.total} lines=${JSON.stringify(slip.lines)} newly=${slip.newly.map(c => c.id)} balance=${Game.P.points}`);
  }
  const lb = await Game.getLeaderboard(); console.log('\nleaderboard quarter entries:', lb.quarter.length, 'nitro:', lb.nitro.length, 'rt:', lb.rt.length);
})();
