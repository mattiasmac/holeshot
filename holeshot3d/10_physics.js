/* =====================================================================
   HOLESHOT — physics, cars, timing (pure module, no DOM)
   Units: SI internally. Display: ft, mph, lb, hp.
   ===================================================================== */
const PH = (function () {
  const G = 9.80665, RHO = 1.2;
  const LBFT_NM = 1.35582, LB_KG = 0.453592, IN_M = 0.0254, FT_M = 0.3048, MS_MPH = 2.23694, HP_W = 745.7;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;

  // Normalised torque curve shapes: [rpm fraction of redline, torque fraction]
  const SHAPES = {
    na:       [[0,0.22],[0.15,0.5],[0.3,0.78],[0.45,0.92],[0.6,1.0],[0.75,0.98],[0.87,0.91],[0.95,0.82],[1,0.74]],
    sc:       [[0,0.3],[0.12,0.6],[0.22,0.85],[0.35,1.0],[0.7,1.0],[0.85,0.93],[0.95,0.84],[1,0.76]],
    turbo:    [[0,0.18],[0.15,0.36],[0.25,0.7],[0.35,0.95],[0.42,1.0],[0.7,1.0],[0.85,0.92],[0.95,0.82],[1,0.72]],
    flat:     [[0,0.25],[0.15,0.5],[0.3,0.72],[0.6,0.92],[0.8,1.0],[0.92,0.97],[1,0.9]],
    prostock: [[0,0.15],[0.25,0.3],[0.4,0.52],[0.6,0.8],[0.75,0.94],[0.85,1.0],[0.93,0.99],[0.98,0.94],[1,0.88]],
    promod:   [[0,0.25],[0.15,0.5],[0.3,0.78],[0.5,0.95],[0.7,1.0],[0.85,0.98],[0.95,0.9],[1,0.82]],
  };
  function shapeAt(shape, f) {
    f = clamp(f, 0, 1);
    for (let i = 1; i < shape.length; i++) {
      if (f <= shape[i][0]) {
        const [x0, y0] = shape[i - 1], [x1, y1] = shape[i];
        return lerp(y0, y1, (f - x0) / (x1 - x0));
      }
    }
    return shape[shape.length - 1][1];
  }

  /* ---------------- Car catalogue ----------------
     hp = flywheel peak, weight = lb with driver, redline = rev limiter,
     gears/final, tire = diameter in, growth = fraction at 150 mph,
     mu = tire grip on prepped track, drive, wf = static front weight fraction,
     cg = cg height / wheelbase, cd*A m2, clA = downforce coeff*area,
     trans: manual | clutchless | auto | dct | single | none
     dist = race distance ft. target = real-world ET/mph reference.
  ---------------------------------------------------- */
  const CARS = [
    { id:'ctr', name:'Civic Type R', maker:'Honda', cls:'Street', tier:1, price:0, payout:150,
      hp:315, pf:0.89, weight:3180, redline:7000, idle:900, shape:'turbo', cyl:4, sound:'i4',
      gears:[3.62,2.27,1.63,1.28,1.03,0.83], final:4.11, trans:'manual', shiftTime:0.32,
      tire:25.3, growth:0, mu:1.4, drive:'FWD', wf:0.61, cg:0.13, cdA:0.68, clA:0, eff:0.88,
      launchRpm:2300, tc:1, view:'car', color:'#C8CDD2', accent:'#D8262C', rival:'Golf R',
      dist:1320, target:'13.5 @ 108', blurb:'Front-drive starter. Teaches the tree and the shift light.' },
    { id:'gt', name:'Mustang GT', maker:'Ford', cls:'Street', tier:2, price:3000, payout:220,
      hp:480, pf:0.90, weight:3830, redline:7500, idle:850, shape:'na', cyl:8, sound:'v8',
      gears:[3.24,2.28,1.72,1.26,1.00,0.63], final:3.55, trans:'manual', shiftTime:0.30,
      tire:27.7, growth:0, mu:1.42, drive:'RWD', wf:0.54, cg:0.19, cdA:0.74, clA:0, eff:0.85,
      launchRpm:4500, tc:1, view:'car', color:'#1E2A78', accent:'#E8E8E8', rival:'Camaro SS',
      dist:1320, target:'12.4 @ 116', blurb:'5.0 Coyote, six-speed. Rear-drive means real wheelspin.' },
    { id:'gtr', name:'GT-R', maker:'Nissan', cls:'Street', tier:3, price:6500, payout:300,
      hp:565, pf:0.90, weight:3900, redline:7000, idle:800, shape:'turbo', cyl:6, sound:'v6',
      gears:[4.06,2.30,1.60,1.25,1.00,0.80], final:3.70, trans:'dct', shiftTime:0.12,
      tire:27.9, growth:0, mu:1.4, drive:'AWD', wf:0.54, cg:0.19, cdA:0.68, clA:0, eff:0.87, slipTau:0.35,
      launchRpm:3200, tc:1, view:'car', color:'#8E8F95', accent:'#111', rival:'RS 7',
      dist:1320, target:'11.1 @ 126', blurb:'All-wheel-drive launch control. Forgiving 60-foot.' },
    { id:'hellcat', name:'Challenger Hellcat', maker:'Dodge', cls:'Street', tier:4, price:9000, payout:360,
      hp:707, weight:4450, redline:6200, idle:800, shape:'sc', cyl:8, sound:'v8sc',
      gears:[4.70,3.13,2.10,1.67,1.29,1.00,0.84,0.67], final:3.09, trans:'auto', shiftTime:0.16,
      tire:27.9, growth:0, mu:1.38, drive:'RWD', wf:0.56, cg:0.20, cdA:0.90, clA:0, eff:0.85,
      launchRpm:1500, tc:1.8, view:'car', color:'#7B1113', accent:'#111', rival:'Camaro ZL1',
      dist:1320, target:'11.2 @ 126', blurb:'Supercharged Hemi on street tires. Easy to smoke the launch.' },
    { id:'z06', name:'Corvette Z06', maker:'Chevrolet', cls:'Street', tier:5, price:14000, payout:450,
      hp:670, pf:0.94, weight:3650, redline:8600, idle:900, shape:'flat', cyl:8, sound:'flat8',
      gears:[4.03,2.47,1.66,1.24,0.97,0.76,0.60,0.48], final:5.56, trans:'dct', shiftTime:0.10,
      tire:27.6, growth:0, mu:1.45, drive:'RWD', wf:0.40, cg:0.17, cdA:0.86, clA:0.2, eff:0.88,
      launchRpm:5000, tc:1, view:'car', color:'#F2C230', accent:'#111', rival:'911 Turbo S',
      dist:1320, target:'10.5 @ 131', blurb:'Flat-plane V8 screaming to 8,600. Mid-engine hook.' },
    { id:'plaid', name:'Model S Plaid', maker:'Tesla', cls:'Street', tier:6, price:18000, payout:520,
      hp:1020, weight:4800, redline:20000, idle:0, shape:'ev', cyl:0, sound:'ev', evTorqueNm:1420,
      gears:[7.56], final:1.0, trans:'single', shiftTime:0,
      tire:28.3, growth:0, mu:1.35, drive:'AWD', wf:0.50, cg:0.13, cdA:0.62, clA:0, eff:0.89,
      launchRpm:0, tc:1, view:'car', color:'#EDEDED', accent:'#222', rival:'Taycan Turbo S',
      dist:1320, target:'9.3 @ 151', blurb:'Three motors, one gear. Nothing to shift; everything to react to.' },
    { id:'demon', name:'Demon 170', maker:'Dodge', cls:'Street', tier:7, price:24000, payout:600,
      hp:1025, weight:4280, redline:6500, idle:850, shape:'sc', cyl:8, sound:'v8sc',
      gears:[4.70,3.13,2.10,1.67,1.29,1.00,0.84,0.67], final:3.09, trans:'auto', shiftTime:0.14,
      tire:28.3, growth:0.01, mu:2.5, drive:'RWD', wf:0.56, cg:0.24, cdA:0.84, clA:0, eff:0.86, slipTau:0.5,
      launchRpm:1500, tc:2.2, view:'car', color:'#1C1C1C', accent:'#F2C230', rival:'Redeye',
      dist:1320, target:'8.91 @ 151', blurb:'Transbrake, drag radials, factory wheelies. NHRA-certified 8.91.' },
    { id:'prostock', chute:true, name:'Pro Stock Camaro', maker:'NHRA', cls:'Pro Stock', tier:8, price:42000, payout:900,
      hp:1560, weight:2350, redline:10500, idle:1800, shape:'prostock', cyl:8, sound:'prostock',
      gears:[2.65,1.89,1.46,1.18,1.00], final:4.86, trans:'clutchless', shiftTime:0.05,
      tire:33.0, growth:0.03, mu:3.9, drive:'RWD', wf:0.48, cg:0.20, cdA:0.55, clA:0.25, eff:0.91, slipTau:0.6,
      launchRpm:8500, tc:1, view:'scoop', color:'#E04B1E', accent:'#FFFFFF', rival:'Pro Stock GTO',
      dist:1320, target:'6.5 @ 212', blurb:'500-cubic-inch naturally aspirated. Four clutchless shifts at 10,000+.' },
    { id:'promod', chute:true, name:'Pro Mod Cuda', maker:'NHRA', cls:'Pro Mod', tier:9, price:65000, payout:1200,
      hp:4100, ramp0:0.5, rampT:4.0, weight:2650, redline:9500, idle:1600, shape:'promod', cyl:8, sound:'blown',
      gears:[2.80,2.04,1.57,1.25,1.00], final:4.30, trans:'clutchless', shiftTime:0.05,
      tire:34.5, growth:0.035, mu:3.3, drive:'RWD', wf:0.47, cg:0.22, cdA:0.55, clA:0.6, eff:0.90, slipTau:0.7,
      launchRpm:4000, tc:1, view:'scoop', color:'#5E17EB', accent:'#B2F0FF', rival:'Pro Mod Camaro',
      dist:1320, target:'5.75 @ 255', blurb:'Roots-blown door car. 250 mph in under six seconds.' },
    { id:'funny', chute:true, name:'Funny Car', maker:'NHRA', cls:'Nitro', tier:10, price:95000, payout:1500,
      hp:11000, weight:2600, redline:8600, idle:2200, shape:'promod', cyl:8, sound:'nitro',
      gears:[1.0], final:3.20, trans:'none', shiftTime:0,
      tire:36, growth:0.10, mu:3.9, muFade:0.62, ramp0:0.38, rampT:3.3, drive:'RWD', wf:0.40, cg:0.22, cdA:1.5, clA:2.3, eff:0.90,
      launchRpm:8200, tc:1, view:'funny', color:'#F2C230', accent:'#D8262C', rival:'Funny Car',
      dist:1000, target:'3.85 @ 332', blurb:'Nitromethane, no gearbox, 1,000 feet. Pure reaction and nerve.' },
    { id:'topfuel', chute:true, name:'Top Fuel Dragster', maker:'NHRA', cls:'Nitro', tier:11, price:130000, payout:2000,
      hp:11000, weight:2320, redline:8600, idle:2200, shape:'promod', cyl:8, sound:'nitro',
      gears:[1.0], final:3.20, trans:'none', shiftTime:0,
      tire:36, growth:0.12, mu:4.25, muFade:0.62, ramp0:0.4, rampT:3.1, drive:'RWD', wf:0.30, cg:0.10, cdA:1.42, clA:2.4, eff:0.84,
      launchRpm:8200, tc:1, view:'dragster', color:'#111', accent:'#FFB000', rival:'Top Fuel',
      dist:1000, target:'3.68 @ 335', blurb:'11,000 horsepower, 3.6 seconds, 330 mph. The endgame.' },
  ];

  const UPGRADES = {
    engine: { name:'Engine', max:5, desc:'Heads, cam, tune. +6% power per stage.' },
    boost:  { name:'Boost', max:3, desc:'Turbo / blower / nitrous. +10% power per stage.' },
    tires:  { name:'Tires', max:3, desc:'Street → drag radial → slick → pro slick. More grip off the line.' },
    trans:  { name:'Transmission', max:3, desc:'Quicker shifts and less drivetrain loss.' },
    weight: { name:'Weight', max:3, desc:'Strip the interior. -3% mass per stage.' },
  };
  const UPGRADE_ORDER = ['engine', 'boost', 'tires', 'trans', 'weight'];
  function upgradeCost(car, key, nextLevel) {
    const base = Math.max(600, car.price * 0.10);
    const mult = { engine: 0.9, boost: 1.4, tires: 0.8, trans: 1.0, weight: 0.7 }[key];
    return Math.round(base * mult * nextLevel / 100) * 100;
  }
  function upgradeMax(car, key) {
    if (car.trans === 'none' && (key === 'trans')) return 0;
    if (car.trans === 'single' && key === 'trans') return 0;
    if (car.trans === 'none' && key === 'boost') return 2; // nitro tune-up
    return UPGRADES[key].max;
  }

  // Build effective spec from base car + upgrades + tuning
  function buildSpec(car, up, tune) {
    up = up || {}; tune = tune || {};
    const pro = car.tier >= 8;
    const engMul = 1 + (pro ? 0.02 : 0.06) * (up.engine || 0);
    const boostMul = 1 + (pro ? 0.03 : 0.10) * (up.boost || 0);
    const tireMul = pro ? (1 + 0.04 * (up.tires || 0)) : [1, 1.22, 1.42, 1.55][up.tires || 0];
    const transMul = 1 - 0.25 * (up.trans || 0);
    const massMul = 1 - 0.03 * (up.weight || 0);
    const s = Object.assign({}, car);
    s.hp = car.hp * engMul * boostMul * (car.pf || 1);
    s.ramp0 = car.ramp0 === undefined ? 1 : car.ramp0; s.rampT = car.rampT || 1;
    s.mass = car.weight * LB_KG * massMul;
    s.mu = car.mu * tireMul;
    s.shiftTime = car.shiftTime * transMul;
    s.eff = Math.min(0.97, car.eff + 0.01 * (up.trans || 0));
    s.tireR = car.tire * IN_M / 2;
    s.launchRpm = tune.launchRpm || car.launchRpm;
    s.deep = !!tune.deep;
    s.tireLevel = up.tires || 0;
    // torque scale so that peak hp matches
    if (car.shape === 'ev') {
      s.torqueNm = (rpm) => { const w = rpm * Math.PI / 30; return Math.min(car.evTorqueNm * engMul * boostMul, s.hp * HP_W / Math.max(w, 1)); };
    } else if (car.trans === 'none') {
      s.torqueNm = () => 0;
    } else {
      const shape = SHAPES[car.shape];
      let best = 0;
      for (let f = 0.05; f <= 1.0001; f += 0.005) best = Math.max(best, shapeAt(shape, f) * f * car.redline / 5252);
      const k = s.hp / best; // lb-ft scale
      s.torqueNm = (rpm) => k * shapeAt(shape, rpm / car.redline) * LBFT_NM;
    }
    s.optShift = optimalShifts(s);
    return s;
  }

  function wheelRpm(spec, v, gear) { return v / (spec.tireR * (1 + spec.growth * Math.min(1, v / 67))) * 30 / Math.PI * spec.final * spec.gears[gear]; }
  function forceAt(spec, rpm, gear, v) {
    const r = spec.tireR * (1 + spec.growth * Math.min(1, v / 67));
    return spec.torqueNm(rpm) * spec.gears[gear] * spec.final * spec.eff / r;
  }
  // Optimal shift rpm for each gear (rpm where next gear makes more force)
  function optimalShifts(spec) {
    const out = [];
    for (let g = 0; g < spec.gears.length - 1; g++) {
      const ratio = spec.gears[g + 1] / spec.gears[g];
      let best = spec.redline - 50;
      for (let rpm = spec.redline * 0.55; rpm < spec.redline; rpm += 10) {
        const fNow = spec.torqueNm(rpm) * spec.gears[g];
        const fNext = spec.torqueNm(rpm * ratio) * spec.gears[g + 1];
        if (fNext >= fNow) { best = rpm; break; }
      }
      out.push(Math.min(best, spec.redline * 0.97));
    }
    return out;
  }

  /* ---------------- Run state ---------------- */
  function newRun(spec) {
    return {
      spec, t: -1, x: 0, v: 0, a: 0, gear: 0, rpm: spec.trans === 'none' ? spec.launchRpm : (spec.trans === 'single' ? 0 : spec.launchRpm),
      throttle: 0, launched: false, launchT: null, slip: 0, spinning: false, spinT: 0, spinTotal: 0,
      shifting: 0, shiftPending: false, shifts: [], limiter: false, wheelie: 0, tireHeat: 0.55, spinCool: 0, spinCount: 0, spinDur: 0,
      beamExitT: null, splits: {}, trapT: {}, finished: false, finishT: null, mph: 0,
      rollout: (spec.deep ? 4 : 11.5) * IN_M, done: false, bog: false, coast: false,
    };
  }
  const BEAMS = [60, 330, 660, 1000, 1320];

  function launch(run, tNow) {
    if (run.launched) return;
    run.launched = true; run.launchT = tNow; run.throttle = 1;
    if (run.spec.trans === 'single') run.rpm = 0;
    else run.rpm = run.spec.launchRpm;
    run.slip = run.spec.launchRpm; // engine rpm above wheel rpm (clutch/converter slip)
  }

  // dt: physics step. tNow: race clock (s, 0 = tree green for this lane's timing purposes handled outside)
  function step(run, dt, tNow) {
    const s = run.spec;
    if (!run.launched || run.done) return;
    if (run.coast) { // shut down: throttle off, chutes or brakes, engine to idle
      const decel = G * (s.chute ? 2.6 : 0.75) + 0.5 * RHO * s.cdA * run.v * run.v / s.mass;
      run.a = -decel; run.v = Math.max(0, run.v - decel * dt); run.x += run.v * dt; run.mph = run.v * MS_MPH;
      run.rpm = Math.max(s.idle, run.rpm - 9000 * dt); run.throttle = 0; run.spinning = false; run.limiter = false; run.wheelie = 0;
      if (run.v < 0.3) run.done = true;
      return;
    }
    const v = run.v;
    const wr = s.trans === 'none' ? 0 : wheelRpm(s, v, run.gear);
    // ----- engine rpm & torque -----
    let F = 0, rpm = run.rpm;
    const throttle = run.throttle;
    if (s.trans === 'none') {
      // nitro: power-limited through a slipping multi-stage clutch, traction-limited early
      rpm = Math.min(s.redline, 8100 + v * 3.2);
      const tSince = run.launchT === null ? 0 : tNow - run.launchT;
      const ramp = s.ramp0 + (1 - s.ramp0) * clamp(tSince / s.rampT, 0, 1);
      const P = s.hp * HP_W * s.eff * throttle * ramp;
      F = P / Math.max(v, 6);
    } else {
      // clutch / converter slip decays after launch and after shifts
      const tau = s.slipTau || (s.trans === 'auto' ? 0.42 : (s.trans === 'dct' ? 0.25 : 0.45));
      run.slip *= Math.exp(-dt / tau);
      if (run.slip < 15) run.slip = 0;
      let engRpm = Math.max(wr + run.slip, s.idle);
      if (s.trans === 'single') engRpm = wr;
      if (run.spinning) engRpm = run.rpm; // free-revving during wheelspin
      // rev limiter (fuel cut)
      const onLimiter = engRpm >= s.redline;
      if (onLimiter) engRpm = s.redline;
      rpm = engRpm;
      const tSince = run.launchT === null ? 0 : tNow - run.launchT;
      const ramp = s.ramp0 + (1 - s.ramp0) * clamp(tSince / s.rampT, 0, 1);
      let T = run.shifting > 0 ? 0 : s.torqueNm(rpm) * throttle * ramp;
      if (onLimiter && throttle > 0) T *= 0.35; // fuel cut stutter average
      // torque converter multiplication while slipping (autos)
      if (s.tc > 1 && wr > 0 && !run.spinning) {
        const slipFrac = clamp(run.slip / Math.max(rpm, 1), 0, 1);
        T *= 1 + (s.tc - 1) * slipFrac;
      } else if (s.tc > 1 && wr === 0) T *= s.tc;
      F = forceAt(s, rpm, run.gear, v) / s.torqueNm(rpm) * T; // scale by actual T
      if (!isFinite(F)) F = 0;
    }
    // ----- traction (implicit weight transfer at the grip limit) -----
    const m = s.mass, W = m * G;
    const down = 0.5 * RHO * s.clA * v * v;
    let mu = s.mu;
    if (s.trans === 'none') mu = s.mu * (1 - s.muFade * clamp(v / 150, 0, 1));
    // tire temperature: cold = less grip, overheated = greasy
    const heat = run.tireHeat;
    const heatMul = heat < 1 ? 0.82 + 0.18 * heat : 1 - 0.12 * clamp(heat - 1, 0, 1);
    mu *= heatMul;
    // launch shock: dumping the clutch far above the sweet spot hazes/shakes the tires for the first tenths
    if (run.launchT !== null && tNow - run.launchT < 0.3 && s.trans !== 'single' && s.trans !== 'none')
      mu *= 1 - 0.45 * clamp((s.launchRpm / s.redline - 0.6) / 0.4, 0, 1);
    let N;
    run.wheelie = 0;
    if (s.drive === 'RWD') {
      const denom = Math.max(0.15, 1 - mu * s.cg);
      N = W * (1 - s.wf) / denom;
      if (N > W) { run.wheelie = clamp((N - W) / (W * 0.35), 0, 1); N = W * (1 + 0.05 * run.wheelie); }
    } else if (s.drive === 'FWD') {
      N = W * s.wf / (1 + mu * s.cg);
    } else N = W;
    N += down;
    const Flim = mu * N;
    // ----- wheelspin -----
    if (s.trans === 'none') {
      F = Math.min(F, Flim);
      run.spinning = F >= Flim * 0.999 && v < 60 && throttle > 0.8; // tire haze look, force already capped
      if (run.spinning) run.spinTotal += dt;
    } else if (s.trans === 'single') {
      F = Math.min(F, Flim); // EV traction control
      run.spinning = false;
    } else {
      if (!run.spinning) {
        if (F > Flim * 1.03 && throttle > 0.6 && run.spinCool <= 0) {
          run.spinning = true; run.spinT = 0; run.spinCount++;
          run.spinDur = 0.18 + 0.45 * clamp(F / Flim - 1, 0, 1.5);
        }
        F = Math.min(F, Flim);
      }
      if (run.spinning) {
        run.spinT += dt; run.spinTotal += dt;
        F = Flim * 0.85;
        // engine revs freely until the tyre hooks up again or the driver pedals
        run.rpm = Math.min(s.redline, run.rpm + (9000 + s.redline * 0.6) * dt * throttle);
        rpm = run.rpm;
        const wrNow = wheelRpm(s, v, run.gear);
        const lifted = throttle < 0.3 && run.spinT > 0.06;
        if (lifted || run.spinT > run.spinDur || wrNow > run.rpm * 0.97) {
          run.spinning = false; run.spinCool = lifted ? 0.5 : 0.35;
          run.slip = Math.max(0, run.rpm - wrNow) * 0.5;
          run.rpm = wrNow + run.slip; rpm = run.rpm;
        }
      }
      run.spinCool -= dt;
    }
    // ----- resistances -----
    const drag = 0.5 * RHO * s.cdA * v * v;
    const rr = 0.014 * W;
    const a = (F - drag - rr * (v > 0.05 ? 1 : 0)) / m;
    run.a = Math.max(a, 0);
    run.v = Math.max(0, v + a * dt);
    const xPrev = run.x;
    run.x += run.v * dt;
    const tAt = (xm) => tNow + dt * clamp((xm - xPrev) / Math.max(1e-9, run.x - xPrev), 0, 1);
    run.rpm = rpm;
    run.mph = run.v * MS_MPH;
    // bog detection (manual clutch cars)
    if (run.launchT !== null && tNow - run.launchT < 0.8 && s.trans !== 'single' && s.trans !== 'none' && rpm < s.redline * 0.32 && !run.spinning) run.bog = true;
    // ----- shifting -----
    if (run.shifting > 0) {
      run.shifting -= dt;
      if (run.shifting <= 0) {
        run.shifting = 0;
        run.gear = Math.min(run.gear + 1, s.gears.length - 1);
        const wr2 = wheelRpm(s, run.v, run.gear);
        run.slip = s.trans === 'auto' ? 250 : 80;
        run.rpm = wr2 + run.slip; run.spinning = false;
      }
    }
    run.limiter = s.trans !== 'none' && s.trans !== 'single' && run.rpm >= s.redline - 1 && run.shifting === 0;
    // ----- timing beams -----
    const tRace = tNow;
    if (run.beamExitT === null && run.x >= run.rollout) run.beamExitT = tAt(run.rollout);
    if (run.beamExitT !== null) {
      const xFt = (run.x - run.rollout) / FT_M;
      for (const b of BEAMS) {
        if (b > s.dist) break;
        if (run.splits[b] === undefined && xFt >= b) run.splits[b] = tAt(run.rollout + b * FT_M) - run.beamExitT;
        if (run.trapT[b] === undefined && (b === 660 || b === s.dist) && xFt >= b - 66) run.trapT[b] = tAt(run.rollout + (b - 66) * FT_M);
      }
      if (!run.finished && xFt >= s.dist) {
        run.finished = true; run.finishT = run.beamExitT + run.splits[s.dist]; run.et = run.splits[s.dist];
        const dtTrap = run.finishT - (run.trapT[s.dist] !== undefined ? run.trapT[s.dist] : run.finishT - 0.3);
        run.trapMph = 45 / Math.max(dtTrap, 0.01);
        if (run.trapT[660] !== undefined && run.splits[660] !== undefined) run.mph660 = 45 / Math.max((run.splits[660] + run.beamExitT) - run.trapT[660], 0.01);
      }
    }
    if (run.finished && run.x > (s.dist + 500) * FT_M) run.done = true;
  }

  function requestShift(run, tNow) {
    const s = run.spec;
    if (!run.launched || run.shifting > 0 || run.gear >= s.gears.length - 1 || s.trans === 'none' || s.trans === 'single') return null;
    const opt = s.optShift[run.gear];
    const err = run.rpm - opt;
    const tol = s.redline;
    let grade;
    if (run.limiter) grade = 'late';
    else if (Math.abs(err) <= tol * 0.016) grade = 'perfect';
    else if (Math.abs(err) <= tol * 0.045) grade = 'good';
    else if (err < 0) grade = 'early';
    else grade = 'late';
    run.shifting = Math.max(0.03, s.shiftTime);
    const rec = { gear: run.gear + 2, rpm: Math.round(run.rpm), opt: Math.round(opt), grade, t: tNow };
    run.shifts.push(rec);
    return rec;
  }

  /* ---------------- Quick full-run simulation (dyno / AI planning) ---------------- */
  function simulate(spec, opts) {
    opts = opts || {};
    const run = newRun(spec);
    run.tireHeat = opts.tireHeat !== undefined ? opts.tireHeat : 1.0;
    const dt = 1 / 400;
    let t = 0;
    launch(run, 0);
    const shiftNoise = opts.shiftNoise || 0;
    let nextShiftRpm = null;
    const pedal = opts.pedal !== undefined ? opts.pedal : 0.1; // how quickly the AI lifts when the tires spin (s)
    while (!run.finished && t < 40) {
      // driver pedals the throttle when the tires spin
      if (spec.trans !== 'none' && spec.trans !== 'single') run.throttle = (run.spinning && run.spinT > pedal) ? 0.2 : 1;
      if (spec.trans !== 'none' && spec.trans !== 'single' && run.gear < spec.gears.length - 1 && run.shifting === 0) {
        if (nextShiftRpm === null) nextShiftRpm = spec.optShift[run.gear] + shiftNoise * (Math.random() * 2 - 1) * spec.redline;
        if (!run.spinning && (run.rpm >= nextShiftRpm || run.limiter)) { requestShift(run, t); nextShiftRpm = null; }
      }
      step(run, dt, t);
      t += dt;
    }
    return run;
  }
  // Best launch rpm for this spec by 60-ft time search
  function recommendLaunch(spec) {
    if (spec.trans === 'single' || spec.trans === 'none') return spec.launchRpm;
    let best = null;
    const lo = spec.idle + 400, hi = spec.redline * 0.9;
    for (let f = 0; f <= 1.0001; f += 0.1) {
      const rpm = Math.round((lo + (hi - lo) * f) / 100) * 100;
      const sp = Object.assign({}, spec, { launchRpm: rpm });
      const r = simulate(sp);
      const t330 = r.splits[330] || 99;
      if (!best || t330 < best.t330 - 0.0005) best = { rpm, t330 };
    }
    return best.rpm;
  }

  /* ---------------- Reaction / grading ---------------- */
  function gradeRT(rt) {
    if (rt < 0) return { g: 'red', label: 'RED LIGHT', pts: 0 };
    if (rt <= 0.009) return { g: 'perfect', label: 'PERFECT LIGHT', pts: 300 };
    if (rt <= 0.030) return { g: 'great', label: 'GREAT LIGHT', pts: 150 };
    if (rt <= 0.060) return { g: 'good', label: 'GOOD LIGHT', pts: 60 };
    if (rt <= 0.120) return { g: 'avg', label: 'AVERAGE', pts: 20 };
    return { g: 'slow', label: 'LATE', pts: 0 };
  }
  function fmtT(t, d) { if (t === undefined || t === null || !isFinite(t)) return '—'; return t.toFixed(d === undefined ? 3 : d); }

  return { G, FT_M, MS_MPH, IN_M, CARS, UPGRADES, UPGRADE_ORDER, upgradeCost, upgradeMax, buildSpec, newRun, launch, step, requestShift, simulate, recommendLaunch, gradeRT, fmtT, wheelRpm, BEAMS, clamp, lerp };
})();
if (typeof module !== 'undefined') module.exports = PH;
