const PH = require('./10_physics.js');
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('car', 20), pad('60ft', 7), pad('330', 7), pad('660', 7), pad('mph660', 8), pad('1000', 7), pad('ET', 7), pad('mph', 7), pad('launch', 7), pad('spin', 6), 'shifts / target');
for (const car of PH.CARS) {
  const spec = PH.buildSpec(car, {}, {});
  const r = PH.simulate(spec, { tireHeat: 1 });
  const sh = r.shifts.map(s => s.rpm).join(',');
  console.log(pad(car.name, 20), pad(PH.fmtT(r.splits[60]), 7), pad(PH.fmtT(r.splits[330]), 7), pad(PH.fmtT(r.splits[660]), 7), pad(r.mph660 ? r.mph660.toFixed(1) : '-', 8), pad(PH.fmtT(r.splits[1000]), 7), pad(PH.fmtT(r.et), 7), pad(r.trapMph ? r.trapMph.toFixed(1) : '-', 7), pad(spec.launchRpm, 7), pad(r.spinTotal.toFixed(2), 6), sh, '/', car.target, 'opt', spec.optShift.map(Math.round).join(','));
}
if (process.argv[2] === 'launch') {
  for (const car of PH.CARS) {
    const spec = PH.buildSpec(car, {}, {});
    console.log(car.name, 'recommended launch rpm', PH.recommendLaunch(spec));
  }
}
