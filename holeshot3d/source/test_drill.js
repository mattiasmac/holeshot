const fs = require('fs');
const PH = require('./10_physics.js'); global.PH = PH;
let nowMs = 0; global.performance = { now: () => nowMs };
global.window = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, addEventListener() {} };
global.localStorage = { _m: {}, getItem(k) { return this._m[k] === undefined ? null : this._m[k]; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };
global.document = { querySelector() { return null; }, createElement() { return { style: {}, getBoundingClientRect() { return { top: 0, left: 0, right: 390, bottom: 844 }; }, remove() {} }; }, body: { appendChild() {} }, addEventListener() {}, documentElement: {} };
const timers = []; global.setTimeout = (fn, ms) => { timers.push({ at: nowMs + ms, fn }); return timers.length; }; global.clearTimeout = () => {};
let frameFn = null; global.requestAnimationFrame = (fn) => { frameFn = fn; return 1; }; global.cancelAnimationFrame = () => {};
global.R = { W: 390, H: 844, particles: [], stepParticles() {}, spawnSmoke() {}, drawScene() {}, attach() {}, resize() {}, clear() {} };
const src = fs.readFileSync('20_store_audio.js', 'utf8') + '\n' + fs.readFileSync('40_game.js', 'utf8');
const { Game } = new Function('PH', 'R', src + '\n; return { Game };')(PH, global.R);
let slip = null, phases = [];
const ui = { safe: { top: 0, left: 0, right: 0, bottom: 0 }, enterRace() {}, leaveRace() {}, phase(p) { phases.push(p); }, coach() {}, showSlip(res) { slip = res; } };
(async () => {
  await Game.load(); Game.setUI(ui); Game.P.car = 'gt'; Game.P.owned.push('gt');
  const spec = Game.specFor('gt'); const run = PH.newRun(spec); run.tireHeat = 1; PH.launch(run, 0); let tt = 0; while (run.beamExitT === null) { PH.step(run, 1 / 500, tt); tt += 1 / 500; } const rolloutT = run.beamExitT;
  // ---- drill ----
  Game.start({ mode: 'drill' }); const race = Game.race; const evt = () => ({ timeStamp: nowMs }); const dt = 1000 / 60;
  Game.skipBurnout();
  let guard = 0, released = false, offsets = [0.02, -0.03, 0.005, 0.08, 0.015];
  while (!slip && guard++ < 8000) {
    nowMs += dt;
    if (race.phase === 'staging' && race.player.stageT === null) { released = false; Game.leftDown(evt()); Game.leftUp(evt()); }
    if (race.phase === 'staged' && !race.player.holding && !race.player.run.launched) Game.leftDown(evt());
    if (race.phase === 'tree' && !released && race.player.holding) { const rel = race.player.green - rolloutT + offsets[race.drillN]; if (race.clock >= rel) { Game.leftUp(evt()); released = true; } }
    frameFn(nowMs);
    for (const tm of timers.splice(0)) if (nowMs >= tm.at) tm.fn(); else timers.push(tm);
  }
  console.log('drill rts:', slip.rts.map(x => x === null ? 'RED' : x.toFixed(3)).join(' '), 'avg', slip.avg.toFixed(3), 'pts', slip.pts, 'bestDrillAvg', Game.P.stats.bestDrillAvg.toFixed(3));
  // ---- tournament rounds ----
  for (const [rd, diff] of [[1, 'rookie'], [2, 'pro'], [3, 'elite']]) {
    slip = null; Game.stop(); Game.start({ mode: 'tournament', round: rd, diff }); const rc = Game.race; released = false; guard = 0;
    Game.skipBurnout();
    while (!slip && guard++ < 8000) {
      nowMs += dt;
      if (rc.phase === 'staging' && rc.player.stageT === null) { Game.leftDown(evt()); Game.leftUp(evt()); }
      if (rc.phase === 'staged' && !rc.player.holding && !rc.player.run.launched) Game.leftDown(evt());
      if (rc.phase === 'tree' && !released && rc.player.holding) { const rel = rc.player.green - rolloutT + 0.01; if (rc.clock >= rel) { Game.leftUp(evt()); released = true; } }
      if (rc.phase === 'run') { const pr = rc.player.run; if (pr.gear < spec.gears.length - 1 && pr.shifting === 0 && !pr.spinning && pr.rpm >= spec.optShift[pr.gear] - 30) Game.rightDown(evt()); }
      frameFn(nowMs);
      for (const tm of timers.splice(0)) if (nowMs >= tm.at) tm.fn(); else timers.push(tm);
    }
    console.log(`round ${rd} ${diff}: ${slip.win ? 'WIN' : 'LOSS'} you ${PH.fmtT(slip.rt)}/${PH.fmtT(slip.run.et)} ai ${PH.fmtT(slip.aiRt)}/${PH.fmtT(slip.aiRun.et)} pts ${slip.total} lines ${slip.lines.map(l => l[0] + ':' + l[1]).join(', ')}`);
  }
  console.log('tournamentsWon', Game.P.stats.tournamentsWon, 'challenges', Object.keys(Game.P.challenges).join(','), 'balance', Game.P.points);
})();
