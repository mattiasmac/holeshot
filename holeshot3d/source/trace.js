const PH = require('./10_physics.js');
const id = process.argv[2] || 'gt'; const lr = process.argv[3] ? +process.argv[3] : undefined;
const car = PH.CARS.find(c => c.id === id);
const spec = PH.buildSpec(car, {}, { launchRpm: lr });
const run = PH.newRun(spec); run.tireHeat = 1;
PH.launch(run, 0);
const dt = 1/400; let t = 0, next = 0;
while (t < 2.2) {
  if (spec.trans !== 'none' && spec.trans !== 'single') run.throttle = (run.spinning && run.spinT > 0.1) ? 0.2 : 1;
  if (spec.trans !== 'none' && spec.trans !== 'single' && run.gear < spec.gears.length-1 && run.shifting === 0 && !run.spinning && (run.rpm >= spec.optShift[run.gear] || run.limiter)) PH.requestShift(run, t);
  PH.step(run, dt, t); t += dt;
  if (t >= next) { next += 0.1; console.log(t.toFixed(2), 'x', (run.x/0.3048).toFixed(1), 'v', run.mph.toFixed(1), 'rpm', run.rpm.toFixed(0), 'slip', run.slip.toFixed(0), 'a', (run.a/9.81).toFixed(2), 'g', run.gear+1, run.spinning ? 'SPIN' : '', run.limiter ? 'LIM' : '', run.bog ? 'bog':''); }
}
console.log('60ft', run.splits[60]);
