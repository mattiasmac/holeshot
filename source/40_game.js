/* ===================== game logic ===================== */
const Game = (function () {
  const clamp = PH.clamp, FT = PH.FT_M;
  const STEP = 1 / 500;
  const DIFF = {
    rookie: { label: 'Rookie', rt: [0.130, 0.060], shiftNoise: 0.05, pedal: 0.3, heat: 0.85, perf: 0.93, mult: 0.7, desc: 'Slow lights, sloppy shifts, a little less power. Learn the tree here.' },
    pro:    { label: 'Pro', rt: [0.050, 0.028], shiftNoise: 0.02, pedal: 0.12, heat: 1.0, perf: 1.0, mult: 1.0, desc: 'Solid .050 lights and clean shifts in a stock-strength car.' },
    elite:  { label: 'Elite', rt: [0.022, 0.014], shiftNoise: 0.008, pedal: 0.08, heat: 1.0, perf: 1.06, mult: 1.5, desc: 'National-event lights, perfect shifts, a tuned-up car. Bring upgrades.' },
  };
  const RIVAL_COLORS = ['#B02A2A', '#2A57B0', '#2AB06B', '#B07A2A', '#6B2AB0', '#2AA6B0', '#B02A85', '#8A8A8A'];
  const CHALLENGES = [
    { id: 'first_win', t: 'First win light', d: 'Win any race.', r: 300, chk: (s, x) => x && x.win },
    { id: 'green_light', t: 'Green light', d: 'Cut a light under .100 in a race.', r: 400, chk: (s, x) => x && x.rt !== null && x.rt >= 0 && x.rt < 0.100 },
    { id: 'tree_sniper', t: 'Tree sniper', d: 'Cut a light under .030.', r: 1500, chk: (s, x) => x && x.rt !== null && x.rt >= 0 && x.rt < 0.030 },
    { id: 'perfect_light', t: 'Perfect light', d: 'A .000 to .009 reaction time in a race.', r: 4000, chk: (s, x) => x && x.rt !== null && x.rt >= 0 && x.rt <= 0.009 },
    { id: 'shift_master', t: 'Shift master', d: 'Every shift perfect in a manual run of three or more shifts.', r: 1500, chk: (s, x) => x && x.manual && x.shifts.length >= 3 && x.shifts.every(z => z.grade === 'perfect') },
    { id: 'holeshot', t: 'Holeshot hero', d: 'Win against a quicker ET by leaving first.', r: 2000, chk: (s, x) => x && x.holeshot },
    { id: 'ten_club', t: 'Ten-second club', d: 'Run a 9.99 or quicker in the quarter mile.', r: 3000, chk: (s, x) => x && x.dist === 1320 && x.et !== null && x.et < 10 },
    { id: 'six_club', t: 'Six-second club', d: 'Run in the sixes in the quarter mile.', r: 6000, chk: (s, x) => x && x.dist === 1320 && x.et !== null && x.et < 7 },
    { id: 'three_club', t: 'Three-second pass', d: 'Run a 3-second 1,000-foot pass in a nitro car.', r: 10000, chk: (s, x) => x && x.dist === 1000 && x.et !== null && x.et < 4 },
    { id: 'streak5', t: 'Five straight', d: 'Win five races in a row.', r: 2500, chk: (s) => s.streak >= 5 },
    { id: 'bracket_win', t: 'Bracket racer', d: 'Win a bracket race without breaking out.', r: 1500, chk: (s, x) => x && x.mode === 'bracket' && x.win },
    { id: 'champion', t: 'Wally', d: 'Win a three-round tournament.', r: 8000, chk: (s) => s.tournamentsWon >= 1 },
    { id: 'drill', t: 'Practice tree', d: 'Average under .050 across a five-tree reaction drill.', r: 2500, chk: (s) => s.bestDrillAvg !== null && s.bestDrillAvg < 0.050 },
    { id: 'burnout', t: 'Smoke show', d: 'Heat the tires into the green five times.', r: 500, chk: (s) => s.goodBurnouts >= 5 },
    { id: 'deep', t: 'Deep stager', d: 'Win a race while deep staged.', r: 1000, chk: (s, x) => x && x.win && x.deep },
  ];

  /* ---------------- profile ---------------- */
  const defaultProfile = () => ({
    v: 1, name: 'DRIVER', points: 800, car: 'ctr', owned: ['ctr'], upgrades: {}, tuning: {}, bests: {},
    stats: { races: 0, wins: 0, holeshots: 0, redLights: 0, perfectShifts: 0, perfectLights: 0, streak: 0, bestStreak: 0, tournamentsWon: 0, drills: 0, bestDrillAvg: null, goodBurnouts: 0 },
    challenges: {},
    settings: { sound: true, route: 'media', tree: 'pro', auto: false, night: false, difficulty: 'pro', lane: 'right', deep: false, seenHow: false },
  });
  let P = defaultProfile();
  let saveTimer = null;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => Store.set('hs:profile', P, false), 150); }
  async function load() {
    const p = await Store.get('hs:profile', false);
    if (p && p.v === 1) { P = Object.assign(defaultProfile(), p); P.stats = Object.assign(defaultProfile().stats, p.stats || {}); P.settings = Object.assign(defaultProfile().settings, p.settings || {}); }
    return P;
  }
  function reset() { P = defaultProfile(); save(); }
  const carById = (id) => PH.CARS.find(c => c.id === id);
  function upgradesFor(id) { P.upgrades[id] = P.upgrades[id] || { engine: 0, boost: 0, tires: 0, trans: 0, weight: 0 }; return P.upgrades[id]; }
  function tuningFor(id) { const c = carById(id); P.tuning[id] = P.tuning[id] || { launchRpm: c.launchRpm }; return P.tuning[id]; }
  function specFor(id) { const c = carById(id); return PH.buildSpec(c, upgradesFor(id), Object.assign({ deep: P.settings.deep }, tuningFor(id))); }
  function dynoCache() { return dynoMemo; }
  const dynoMemo = {};
  function dyno(id) { // predicted ET for the current build (perfect driver)
    const key = id + JSON.stringify(upgradesFor(id)) + JSON.stringify(tuningFor(id)) + (P.settings.deep ? 'd' : 's');
    if (!dynoMemo[key]) { const r = PH.simulate(specFor(id), { tireHeat: 1 }); dynoMemo[key] = { et: r.et, mph: r.trapMph, sixty: r.splits[60] }; }
    return dynoMemo[key];
  }
  function recommendedLaunch(id) { const key = 'rl' + id + JSON.stringify(upgradesFor(id)); if (!dynoMemo[key]) dynoMemo[key] = PH.recommendLaunch(specFor(id)); return dynoMemo[key]; }
  function buyCar(id) { const c = carById(id); if (P.owned.includes(id) || P.points < c.price) return false; P.points -= c.price; P.owned.push(id); P.car = id; save(); return true; }
  function buyUpgrade(id, key) {
    const c = carById(id), u = upgradesFor(id); const nxt = (u[key] || 0) + 1;
    if (nxt > PH.upgradeMax(c, key)) return false;
    const cost = PH.upgradeCost(c, key, nxt); if (P.points < cost) return false;
    P.points -= cost; u[key] = nxt;
    // keep launch tuning sane after tire upgrades
    save(); return true;
  }

  /* ---------------- race ---------------- */
  let ui = null, race = null, raf = null, lastFrame = 0, acc = 0;
  const S = { tree: { left: {}, right: {} }, hud: {}, board: { me: null, opp: null }, player: {}, opp: null };
  const now = () => performance.now();
  const rand = (a, b) => a + Math.random() * (b - a);
  function gauss(m, sd) { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function blankLights() { return { pre: false, stage: false, a1: false, a2: false, a3: false, green: false, red: false }; }

  function newRace(opts) {
    const car = carById(P.car), spec = specFor(car.id);
    const diff = DIFF[opts.diff || P.settings.difficulty];
    const laneSign = P.settings.lane === 'left' ? -1 : 1;
    const solo = opts.mode === 'clock' || opts.mode === 'drill';
    // AI car: same model, stock build, scaled by difficulty
    const aiUp = { engine: 0, boost: 0, tires: 0, trans: 0, weight: 0 };
    const aiSpec = PH.buildSpec(Object.assign({}, car, { hp: car.hp * diff.perf, mu: car.mu * (1 + 0.5 * (diff.perf - 1)) }), aiUp, { launchRpm: recommendedLaunchStock(car) });
    const r = {
      mode: opts.mode, diff, round: opts.round || 1, drillN: 0, drillRTs: [], solo,
      car, spec, aiSpec, laneSign, phase: 'burnout', t0: now(), clock: 0,
      player: { run: PH.newRun(spec), staged: false, prestage: false, stageT: null, holding: false, launchedAt: null, rt: null, foul: false, green: null, treeStart: null, lights: blankLights(), lift: false, msgs: [], heat: 0.55 },
      ai: { run: PH.newRun(aiSpec), staged: false, prestage: false, stageAt: null, releaseAt: null, launched: false, rt: null, foul: false, green: null, treeStart: null, lights: blankLights(), shiftPlan: null, nextShiftRpm: null, name: car.rival, color: RIVAL_COLORS[car.tier % RIVAL_COLORS.length] },
      bothStagedAt: null, autostartAt: null, treeFired: false, finishedAt: null, result: null,
      dial: opts.dial, aiDial: null, handicap: 0, target: opts.target || null, burnoutDone: false, burnoutGood: false,
    };
    r.player.run.tireHeat = 0.55;
    r.ai.run.tireHeat = diff.heat;
    r.ai.rtTarget = Math.max(-0.02, gauss(diff.rt[0], diff.rt[1]));
    r.ai.rolloutT = rolloutTime(aiSpec, diff.heat);
    if (opts.mode === 'bracket') {
      const sim = PH.simulate(aiSpec, { tireHeat: diff.heat });
      r.aiDial = Math.ceil((sim.et + 0.01 + rand(0, 0.02)) * 100) / 100;
      r.handicap = r.dial - r.aiDial; // >0: player slower, player leaves first
    }
    return r;
  }
  const stockLaunchMemo = {};
  function recommendedLaunchStock(car) { if (!stockLaunchMemo[car.id]) stockLaunchMemo[car.id] = PH.recommendLaunch(PH.buildSpec(car, {}, {})); return stockLaunchMemo[car.id]; }
  function rolloutTime(spec, heat) { const run = PH.newRun(spec); run.tireHeat = heat; PH.launch(run, 0); let t = 0; while (run.beamExitT === null && t < 3) { PH.step(run, 1 / 500, t); t += 1 / 500; } return run.beamExitT === null ? 0.3 : run.beamExitT; }

  function start(opts) {
    race = newRace(opts);
    S.night = P.settings.night; S.lane = race.laneSign; S.dist = race.spec.dist; S.spec = race.spec; S.viewStyle = race.car.view; S.color = race.car.color; S.accent = race.car.accent;
    S.autoShift = P.settings.auto || race.spec.trans === 'single' || race.spec.trans === 'none';
    S.tree.left = race.laneSign === -1 ? race.player.lights : race.ai.lights; S.tree.right = race.laneSign === 1 ? race.player.lights : race.ai.lights;
    S.board = { me: null, opp: null }; S.hud = { rt: '—', et: '0.000', msg: null, sub: null };
    S.opp = race.solo ? null : { x: -1, view: race.car.view, color: race.ai.color, accent: '#dddddd', spinning: false, progress: 0 };
    S.player = { progress: 0 };
    R.particles.length = 0;
    if (P.settings.sound) { Sfx.unlock(); Sfx.startEngine(race.spec.sound); Sfx.setEnabled(true); } else Sfx.setEnabled(false);
    ui.enterRace(race);
    setPhase('burnout');
    lastFrame = now(); acc = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; Sfx.stopEngine(); race = null; }
  function setPhase(ph) {
    race.phase = ph; race.phaseT = race.clock;
    ui.phase(ph, race);
    if (ph === 'burnout') coach('Hold BURNOUT to heat the tires — release in the green');
    if (ph === 'staging') coach('Tap STAGE to roll into the beams');
    if (ph === 'staged') coach(race.mode === 'drill' ? 'Hold LAUNCH. Release on the last amber.' : 'Hold LAUNCH. The tree fires when both cars are in. Release on the last amber.');
    if (ph === 'run') coach(null);
  }
  function coach(text) { ui.coach(text); }
  function msg(text, col, sub) { S.hud.msg = { text, col, t: 1.6 }; if (sub) S.hud.sub = { text: sub, col: '#d9d3c4', t: 1.6 }; else S.hud.sub = null; }

  /* ---- inputs from the UI ---- */
  function evTime(e) { const ts = e && e.timeStamp; const pn = now(); const t = (ts && ts > 0 && Math.abs(ts - pn) < 5000) ? ts : pn; return (t - race.t0) / 1000; }
  function leftDown(e) {
    if (!race) return; const t = evTime(e);
    if (race.phase === 'burnout') { race.player.burning = true; }
    else if (race.phase === 'staging') { if (race.player.stageT === null) { race.player.stageT = race.clock; Sfx.stageClick(); coach('Now hold LAUNCH and wait for the tree'); ui.phase('rolling', race); } else { race.player.holding = true; race.player.holdAt = t; } }
    else if (race.phase === 'staged' || race.phase === 'tree') { race.player.holding = true; race.player.holdAt = t; if (!race.autostartAt && race.bothStagedAt !== null) armTree(); coach(race.phase === 'staged' ? 'Watch the ambers…' : null); }
    else if (race.phase === 'run') { race.player.lift = true; }
  }
  function leftUp(e) {
    if (!race) return; const t = evTime(e);
    if (race.phase === 'burnout') { race.player.burning = false; }
    else if (race.phase === 'staging') { race.player.holding = false; }
    else if ((race.phase === 'staged' || race.phase === 'tree') && race.player.holding) { race.player.holding = false; doLaunch(t); }
    else if (race.phase === 'run') { race.player.lift = false; }
  }
  function rightDown(e) {
    if (!race) return;
    if (race.phase === 'run' && !S.autoShift) {
      const rec = PH.requestShift(race.player.run, race.clock);
      if (rec) onShift(rec, true);
    }
  }
  function skipBurnout() { if (race && race.phase === 'burnout') { race.player.burning = false; setPhase('staging'); } }
  function quit() { stop(); ui.leaveRace(); }

  function armTree() {
    race.autostartAt = race.clock + rand(0.6, 1.3);
  }
  function doLaunch(t) {
    const p = race.player;
    if (p.run.launched) return;
    // leaving before the tree is armed is a foul just like leaving before the green
    PH.launch(p.run, t);
    p.launchedAt = t;
    if (race.phase === 'staged') { // tree not even started: instant red
      p.foul = true; p.rt = -0.5; p.lights.red = true; Sfx.foulBuzz(); msg('RED LIGHT', '#ff2a3d', 'You left before the tree'); race.treeFired = true;
      fireTreeNow(); setPhase('run');
    } else setPhase('run');
    if (p.run.spinning) Sfx.tireChirp(0.5, 0.5);
  }
  function fireTreeNow() { // used when the player fouls before the tree: run the tree instantly for the AI
    if (race.treeStart === undefined || race.treeStart === null) { race.treeStart = race.clock; scheduleTree(); }
  }
  function scheduleTree() {
    const pro = P.settings.tree === 'pro';
    const len = pro ? 0.4 : 1.5;
    // handicap: the lane with the slower dial leaves first
    const pDelay = race.handicap < 0 ? -race.handicap : 0, aDelay = race.handicap > 0 ? race.handicap : 0;
    race.player.treeStart = race.treeStart + pDelay; race.player.green = race.player.treeStart + len;
    race.ai.treeStart = race.treeStart + aDelay; race.ai.green = race.ai.treeStart + len;
    race.ai.releaseAt = race.ai.green - race.ai.rolloutT + race.ai.rtTarget;
    race.treeFired = true;
  }
  function updateLights(lane, t) {
    const pro = P.settings.tree === 'pro'; const ts = lane.treeStart; if (ts === null || ts === undefined) return;
    const L = lane.lights;
    if (pro) { const on = t >= ts && t < ts + 0.4 + 0.5; L.a1 = L.a2 = L.a3 = on && t < ts + 0.4; }
    else { L.a1 = t >= ts && t < ts + 0.5; L.a2 = t >= ts + 0.5 && t < ts + 1.0; L.a3 = t >= ts + 1.0 && t < ts + 1.5; }
    L.green = t >= lane.green && !lane.foul;
  }

  /* ---- main loop ---- */
  function frame(ts) {
    if (!race) { raf = null; return; }
    raf = requestAnimationFrame(frame);
    const dtF = Math.min(0.1, (ts - lastFrame) / 1000); lastFrame = ts;
    acc += dtF;
    let n = 0;
    while (acc >= STEP && n < 200) { tick(STEP); acc -= STEP; n++; }
    if (S.hud.msg) S.hud.msg.t -= dtF; if (S.hud.sub) S.hud.sub.t -= dtF;
    if (!race) return;
    audioFrame(dtF);
    R.stepParticles(dtF);
    render();
  }
  function tick(dt) {
    race.clock += dt; const t = race.clock;
    const p = race.player, a = race.ai, pr = p.run, ar = a.run;
    switch (race.phase) {
      case 'burnout': {
        if (p.burning) { p.heat = Math.min(1.55, p.heat + 0.34 * dt); pr.rpm = Math.min(race.spec.redline * 0.75, pr.rpm + 9000 * dt); p.burnT = t; }
        else { pr.rpm = Math.max(race.spec.idle, pr.rpm - 6000 * dt); if (p.burnT && p.heat > 0.7 && t - p.burnT > 0.6) { race.burnoutGood = p.heat >= 0.95 && p.heat <= 1.18; setPhase('staging'); } }
        pr.tireHeat = p.heat;
        break;
      }
      case 'staging': {
        { const target = p.holding ? race.spec.launchRpm : race.spec.idle; pr.rpm += (target - pr.rpm) * Math.min(1, dt * 12); }
        if (p.stageT !== null) {
          const e = t - p.stageT;
          if (e > 0.5 && !p.lights.pre) { p.lights.pre = true; Sfx.stageClick(); }
          if (e > 1.15 && !p.lights.stage) { p.lights.stage = true; p.staged = true; Sfx.stageClick(); }
          if (P.settings.deep && e > 1.7 && p.lights.pre) { p.lights.pre = false; }
        }
        if (!race.solo) {
          if (a.stageAt === null) a.stageAt = t + rand(0.3, 2.2);
          if (t > a.stageAt + 0.5) a.lights.pre = true;
          if (t > a.stageAt + 1.15) { a.lights.stage = true; a.staged = true; }
        } else a.staged = true;
        if (p.staged && a.staged && (!P.settings.deep || !p.lights.pre)) { race.bothStagedAt = t; setPhase('staged'); if (p.holding) armTree(); }
        break;
      }
      case 'staged': {
        // engine on the two-step while holding
        const target = p.holding ? race.spec.launchRpm : race.spec.idle;
        pr.rpm += (target - pr.rpm) * Math.min(1, dt * 12);
        pr.limiter = p.holding && race.spec.trans !== 'single' && Math.abs(pr.rpm - race.spec.launchRpm) < 60 && Math.floor(t * 30) % 3 === 0;
        if (!race.autostartAt && t - race.bothStagedAt > 4) armTree(); // autostart fires whether you're ready or not
        if (race.autostartAt && t >= race.autostartAt) { race.treeStart = t; scheduleTree(); setPhase('tree'); }
        break;
      }
      case 'tree':
      case 'run':
      case 'done': {
        const tStep = t - dt;
        if (race.treeFired) { updateLights(p, t); if (!race.solo) updateLights(a, t); }
        if (race.phase === 'tree' && !pr.launched && p.green !== null && t > p.green + 6) { p.holding = false; doLaunch(t); }
        if (race.phase === 'tree') {
          const target = p.holding ? race.spec.launchRpm : race.spec.idle;
          pr.rpm += (target - pr.rpm) * Math.min(1, dt * 12);
          pr.limiter = p.holding && race.spec.trans !== 'single' && Math.abs(pr.rpm - race.spec.launchRpm) < 60 && Math.floor(t * 30) % 3 === 0;
        }
        // AI launch
        if (!race.solo && !a.launched && t >= a.releaseAt) { PH.launch(ar, a.releaseAt); a.launched = true; }
        // player throttle (pedal) and auto-shift
        if (pr.launched) {
          pr.throttle = p.lift ? 0.15 : 1;
          if (S.autoShift && race.spec.trans !== 'single' && race.spec.trans !== 'none' && pr.shifting === 0 && pr.gear < race.spec.gears.length - 1 && !pr.spinning) {
            if (pr.rpm >= race.spec.optShift[pr.gear] - race.spec.redline * 0.012) { if (!p.autoDelay) p.autoDelay = t + 0.03; if (t >= p.autoDelay) { const rec = PH.requestShift(pr, t); if (rec) { onShift(rec, false); p.autoDelay = 0; } } }
          }
          PH.step(pr, dt, tStep);
          if (pr.beamExitT !== null && p.rt === null) { p.rt = pr.beamExitT - p.green; if (p.rt < 0) { p.foul = true; p.lights.red = true; Sfx.foulBuzz(); msg('RED LIGHT', '#ff2a3d', 'Left ' + Math.abs(p.rt).toFixed(3) + 's too soon'); } else { const g = PH.gradeRT(p.rt); msg(g.label, g.g === 'perfect' ? '#2be35a' : g.g === 'great' ? '#2be35a' : g.g === 'good' ? '#ffb000' : '#d9d3c4', 'R/T ' + p.rt.toFixed(3)); } }
          if (race.mode === 'drill' && pr.splits[60] !== undefined && !p.drillDone) { p.drillDone = true; pr.coast = true; pr.throttle = 0; endDrillTree(); }
        }
        if (ar.launched) {
          // AI pedals & shifts
          ar.throttle = (ar.spinning && ar.spinT > race.diff.pedal) ? 0.2 : 1;
          if (race.aiSpec.trans !== 'none' && race.aiSpec.trans !== 'single' && ar.gear < race.aiSpec.gears.length - 1 && ar.shifting === 0 && !ar.spinning) {
            if (a.nextShiftRpm === null) a.nextShiftRpm = race.aiSpec.optShift[ar.gear] + gauss(0, race.diff.shiftNoise) * race.aiSpec.redline;
            if (ar.rpm >= a.nextShiftRpm || ar.limiter) { PH.requestShift(ar, t); a.nextShiftRpm = null; }
          }
          PH.step(ar, dt, tStep);
          if (ar.beamExitT !== null && a.rt === null) { a.rt = ar.beamExitT - a.green; if (a.rt < 0) { a.foul = true; a.lights.red = true; } }
        }
        // shut down after the stripe: lift, chutes / brakes, engine to idle
        if (pr.finished && !pr.coast) { pr.coast = true; pr.throttle = 0; S.board.me = { et: pr.et.toFixed(3), mph: pr.trapMph.toFixed(2) }; if (race.spec.chute) msg('CHUTES OUT', '#d9d3c4'); }
        if (ar.finished && !ar.coast) { ar.coast = true; ar.throttle = 0; S.board.opp = { et: ar.et.toFixed(3), mph: ar.trapMph.toFixed(2) }; }
        // the pass is over when YOU are across the stripe (and the rival is across or hopelessly behind)
        if (race.finishedAt === null && race.mode !== 'drill') {
          const pDone = pr.finished, aDone = race.solo || ar.finished || (pDone && t - pr.finishT > 5);
          const timedOut = pr.launched && t - pr.launchT > 45;
          if ((pDone && aDone) || timedOut) { race.finishedAt = t; setPhase('done'); }
        }
        if (race.finishedAt !== null && t - race.finishedAt > 2.4 && !race.result) finishRace();
        break;
      }
    }
  }
  function audioFrame(dtF) {
    const p = race.player, pr = p.run;
    if (P.settings.sound) Sfx.updateEngine(pr.rpm, pr.launched ? pr.throttle : (p.burning || p.holding ? 0.9 : 0.15), pr.limiter, pr.mph);
    if (pr.launched && pr.spinning && Math.random() < dtF * 10) Sfx.tireChirp(0.12, 0.12);
    if (p.burning && Math.random() < dtF * 6) Sfx.tireChirp(0.18, 0.08);
  }

  function onShift(rec, manual) {
    Sfx.shiftClack(race.spec.trans === 'clutchless');
    const col = rec.grade === 'perfect' ? '#2be35a' : rec.grade === 'good' ? '#ffb000' : '#ff5b6a';
    const label = rec.grade === 'perfect' ? 'PERFECT SHIFT' : rec.grade === 'good' ? 'GOOD SHIFT' : rec.grade === 'early' ? 'EARLY — BOGGED' : 'LATE — ON THE LIMITER';
    if (manual) msg(label, col, rec.gear + (rec.gear === 2 ? 'nd' : rec.gear === 3 ? 'rd' : 'th') + ' gear at ' + rec.rpm + ' · window ' + rec.opt);
  }

  /* ---- drill ---- */
  function endDrillTree() {
    const p = race.player;
    race.drillRTs.push(p.foul ? null : p.rt);
    race.drillN++;
    setTimeout(() => {
      if (!race) return;
      if (race.drillN >= 5) { finishDrill(); return; }
      // reset for the next tree
      race.player = Object.assign(race.player, { run: PH.newRun(race.spec), staged: false, prestage: false, stageT: null, holding: false, launchedAt: null, rt: null, foul: false, green: null, treeStart: null, lights: blankLights(), lift: false, drillDone: false });
      race.player.run.tireHeat = 1.0;
      race.ai.lights = blankLights(); race.ai.staged = false;
      S.tree.left = race.laneSign === -1 ? race.player.lights : race.ai.lights; S.tree.right = race.laneSign === 1 ? race.player.lights : race.ai.lights;
      race.bothStagedAt = null; race.autostartAt = null; race.treeFired = false; race.treeStart = null;
      msg('TREE ' + (race.drillN + 1) + ' OF 5', '#ffb000'); setPhase('staging');
    }, 1400);
  }
  function finishDrill() {
    const rts = race.drillRTs; const valid = rts.filter(x => x !== null);
    const avg = rts.reduce((s, x) => s + (x === null ? 0.5 : x), 0) / rts.length;
    P.stats.drills++; if (P.stats.bestDrillAvg === null || avg < P.stats.bestDrillAvg) P.stats.bestDrillAvg = avg;
    const pts = Math.round(Math.max(0, (0.25 - avg)) * 4000 + 100);
    P.points += pts;
    const newly = checkChallenges(null);
    save();
    Sfx.stopEngine();
    race.result = { drill: true, rts, avg, pts, newly };
    ui.showSlip(race.result, race);
  }

  /* ---- results ---- */
  function finishRace() {
    const p = race.player, a = race.ai, pr = p.run, ar = a.run, solo = race.solo;
    const pTotal = pr.finished ? pr.finishT : Infinity, aTotal = (!solo && ar.finished) ? ar.finishT : Infinity;
    let win = false, reason = '';
    if (race.mode === 'clock') {
      win = pr.finished && !p.foul && pr.et <= race.target; reason = win ? 'Under the target' : (p.foul ? 'Red light' : 'Over the target');
    } else {
      const pBreak = race.mode === 'bracket' && pr.finished && pr.et < race.dial - 0.0005;
      const aBreak = race.mode === 'bracket' && ar.finished && ar.et < race.aiDial - 0.0005;
      if (p.foul && a.foul) { win = p.rt > a.rt; reason = 'Both red — first to foul loses'; }
      else if (p.foul) { win = false; reason = 'Red light'; }
      else if (a.foul) { win = true; reason = 'Rival red-lit'; }
      else if (pBreak && aBreak) { win = (race.dial - pr.et) < (race.aiDial - ar.et); reason = 'Both broke out — smaller breakout wins'; }
      else if (pBreak) { win = false; reason = 'Broke out (ran under your dial)'; }
      else if (aBreak) { win = true; reason = 'Rival broke out'; }
      else if (!pr.finished) { win = false; reason = 'Did not finish'; }
      else { win = pTotal < aTotal; reason = win ? 'First to the stripe' : 'Rival got there first'; }
    }
    const holeshot = win && !solo && ar.finished && pr.finished && ar.et < pr.et && !a.foul && !p.foul;
    const margin = (!solo && pr.finished && ar.finished) ? aTotal - pTotal : null;
    // points
    const base = race.car.payout * race.diff.mult;
    const lines = [];
    const add = (label, v) => { v = Math.round(v); if (v) lines.push([label, v]); };
    if (p.foul) { add('Red light — no purse', 0); add('Show-up money', base * 0.1); }
    else {
      add('Completed pass', base);
      if (race.mode !== 'clock') add(win ? (race.mode === 'bracket' ? 'Bracket win' : 'Win light') : 'Runner-up', win ? base : base * 0.25);
      else if (win) add('Beat the clock', base * 2);
      if (holeshot) add('Holeshot win', base * 0.5);
      const g = PH.gradeRT(p.rt); if (g.pts) add(g.label, g.pts);
      const perf = pr.shifts.filter(s => s.grade === 'perfect').length;
      if (!S.autoShift && perf) add('Perfect shifts ×' + perf, perf * 40);
      if (!S.autoShift && pr.shifts.length >= 3 && perf === pr.shifts.length) add('All perfect', 200);
      if (race.mode === 'tournament') add('Round ' + race.round + ' ×' + Math.pow(2, race.round - 1), win ? base * (Math.pow(2, race.round - 1) - 1) : 0);
    }
    // personal bests
    const b = P.bests[race.car.id] = P.bests[race.car.id] || { et: null, mph: null, rt: null, sixty: null };
    let pb = false; const hadBest = b.et !== null;
    if (pr.finished && !p.foul) {
      if (b.et === null || pr.et < b.et - 0.0005) { b.et = pr.et; pb = hadBest; }
      if (b.mph === null || pr.trapMph > b.mph) b.mph = pr.trapMph;
      if (b.sixty === null || pr.splits[60] < b.sixty) b.sixty = pr.splits[60];
    }
    if (p.rt !== null && p.rt >= 0 && (b.rt === null || p.rt < b.rt)) b.rt = p.rt;
    if (pb) add('Personal best ET', 200);
    let total = lines.reduce((s, l) => s + l[1], 0);
    if (S.autoShift && race.spec.trans !== 'single' && race.spec.trans !== 'none') { total = Math.round(total * 0.8); lines.push(['Auto shift ×0.8', 0]); }
    P.points += total;
    // stats
    const st = P.stats; st.races++;
    if (race.mode !== 'clock') { if (win) { st.wins++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); } else st.streak = 0; }
    if (holeshot) st.holeshots++; if (p.foul) st.redLights++;
    st.perfectShifts += pr.shifts.filter(s => s.grade === 'perfect').length;
    if (p.rt !== null && p.rt >= 0 && p.rt <= 0.009) st.perfectLights++;
    if (race.burnoutGood) st.goodBurnouts++;
    if (race.mode === 'tournament' && win && race.round === 3) st.tournamentsWon++;
    const summary = { win, rt: p.rt, foul: p.foul, et: pr.finished ? pr.et : null, mph: pr.finished ? pr.trapMph : null, dist: race.spec.dist, shifts: pr.shifts, manual: !S.autoShift, holeshot, mode: race.mode, deep: P.settings.deep };
    const newly = checkChallenges(summary);
    Sfx.stopEngine();
    if (win) Sfx.winHorn(); else if (p.foul) Sfx.foulBuzz();
    race.result = { win, reason, holeshot, margin, lines, total, pb, newly, summary, aiName: a.name, solo, aiRun: ar, run: pr, rt: p.rt, aiRt: a.rt, foul: p.foul, aiFoul: a.foul, dial: race.dial, aiDial: race.aiDial, target: race.target, mode: race.mode, round: race.round, diff: race.diff };
    save();
    if (pr.finished && !p.foul && race.mode !== 'drill') submitLeaderboard(pr, p.rt);
    ui.showSlip(race.result, race);
  }
  function checkChallenges(summary) {
    const newly = [];
    for (const c of CHALLENGES) { if (P.challenges[c.id]) continue; let ok = false; try { ok = c.chk(P.stats, summary); } catch (e) { ok = false; } if (ok) { P.challenges[c.id] = Date.now(); P.points += c.r; newly.push(c); } }
    return newly;
  }

  /* ---- leaderboard ---- */
  async function submitLeaderboard(run, rt) {
    const carName = race.car.name, key = race.spec.dist === 1000 ? 'nitro' : 'quarter';
    const board = (await Store.get('hs:lb', true)) || { quarter: [], nitro: [], rt: [] };
    const entry = { n: P.name, c: carName, et: +run.et.toFixed(3), mph: +run.trapMph.toFixed(2), rt: rt === null ? null : +rt.toFixed(3), ts: Date.now() };
    board[key] = (board[key] || []).concat([entry]).sort((x, y) => x.et - y.et).slice(0, 25);
    if (rt !== null && rt >= 0) board.rt = (board.rt || []).concat([entry]).sort((x, y) => x.rt - y.rt).slice(0, 25);
    await Store.set('hs:lb', board, true);
  }
  async function getLeaderboard() { return (await Store.get('hs:lb', true)) || { quarter: [], nitro: [], rt: [] }; }

  /* ---- render bridge ---- */
  function render() {
    const p = race.player, pr = p.run, ar = race.ai.run, spec = race.spec;
    const noseFt = -pr.rollout / FT + pr.x / FT;
    const eyeBack = spec.view === 'dragster' ? 20 : spec.view === 'funny' ? 4 : 6;
    S.camX = noseFt - eyeBack;
    S.pitch = pr.wheelie * 0.8 + (pr.launched ? clamp(pr.a / 40, -0.25, 0.3) : 0);
    S.shake = clamp(pr.a / 60, 0, 1) * 0.5 + (pr.spinning ? 0.5 : 0) + (p.burning ? 0.35 : 0) + clamp((pr.mph - 150) / 250, 0, 1) * 0.4;
    S.speedMph = pr.mph;
    S.player.progress = Math.max(0, (pr.x - pr.rollout) / FT);
    if (S.opp) { S.opp.x = -ar.rollout / FT + ar.x / FT; S.opp.spinning = ar.spinning && ar.launched; S.opp.progress = Math.max(0, (ar.x - ar.rollout) / FT); }
    const h = S.hud;
    h.rpm = pr.rpm; h.mph = pr.mph; h.limiter = pr.limiter; h.shifting = pr.shifting > 0;
    h.gearLabel = pr.coast ? 'N' : spec.trans === 'none' ? 'D' : spec.trans === 'single' ? '1' : (pr.launched || p.holding ? String(pr.gear + 1) : 'N');
    h.opt = (spec.trans === 'none' || spec.trans === 'single' || pr.gear >= spec.gears.length - 1) ? null : spec.optShift[pr.gear];
    h.rt = p.rt === null ? (p.foul ? 'RED' : '—') : (p.foul ? 'RED ' + p.rt.toFixed(3) : p.rt.toFixed(3));
    h.rtCol = p.foul ? '#ff2a3d' : (p.rt !== null && p.rt <= 0.03 ? '#2be35a' : '#f1ebdc');
    const etNow = pr.finished ? pr.et : (pr.beamExitT !== null ? race.clock - pr.beamExitT : 0);
    h.et = etNow.toFixed(3);
    h.heatBar = race.phase === 'burnout' ? p.heat : undefined;
    h.status = pr.coast ? { text: race.spec.chute ? 'CHUTES OUT' : 'SHUTDOWN', col: '#d9d3c4' } : pr.launched && pr.spinning ? { text: 'WHEELSPIN — LIFT', col: '#ff5b6a' } : pr.launched && pr.bog && race.clock - pr.launchT < 1.2 ? { text: 'BOGGED', col: '#ffb000' } : (race.phase === 'burnout' ? { text: p.heat > 1.18 ? 'GREASY' : p.heat >= 0.95 ? 'TIRES READY' : 'COLD TIRES', col: p.heat > 1.18 ? '#ff5b6a' : p.heat >= 0.95 ? '#2be35a' : '#ffb000' } : null);
    if (p.burning) { const W = R.W, H = R.H; R.spawnSmoke(W * 0.08, H * 0.62, 1, 60, 30, -20); R.spawnSmoke(W * 0.92, H * 0.62, 1, 60, -30, -20); }
    if (pr.launched && pr.spinning) { const W = R.W, H = R.H; R.spawnSmoke(W * 0.05, H * 0.6, 1, 40, 20, -30); R.spawnSmoke(W * 0.95, H * 0.6, 1, 40, -20, -30); }
    S.safeTop = ui.safe.top; S.safeLeft = ui.safe.left; S.safeRight = ui.safe.right; S.safeBottom = ui.safe.bottom;
    R.drawScene(S);
  }

  return { DIFF, CHALLENGES, load, save, reset, get P() { return P; }, carById, upgradesFor, tuningFor, specFor, dyno, recommendedLaunch, buyCar, buyUpgrade, start, stop, quit, leftDown, leftUp, rightDown, skipBurnout, getLeaderboard, get race() { return race; }, setUI(u) { ui = u; }, S };
})();
