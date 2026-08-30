// Renders scenes from 30_render.js to PNG with @napi-rs/canvas so they can be inspected.
const fs = require('fs');
const { createCanvas } = require('@napi-rs/canvas');
const PH = require('./10_physics.js'); global.PH = PH;
const W = +process.argv[2] || 390, H = +process.argv[3] || 844;
global.window = { innerWidth: W, innerHeight: H, devicePixelRatio: 1 };
global.document = { documentElement: {} };
const src = fs.readFileSync('30_render.js', 'utf8');
const R = new Function('PH', 'window', 'document', src + '; return R;')(PH, global.window, global.document);
const cv = createCanvas(W, H); cv.style = {};
R.attach(cv);
function scene(carId, opts) {
  const car = PH.CARS.find(c => c.id === carId); const spec = PH.buildSpec(car, {}, {});
  const o = Object.assign({ night: false, camXFt: -7, mph: 0, rpm: spec.idle, gear: 1, oppAhead: 12, spinning: false, lights: 'staged', pitch: 0, shake: 0, board: false, heat: undefined, status: null, msg: null }, opts);
  const L = { pre: true, stage: true, a1: false, a2: false, a3: false, green: false, red: false };
  if (o.lights === 'amber') { L.a1 = true; } if (o.lights === 'green') { L.green = true; } if (o.lights === 'run') { L.pre = L.stage = false; }
  const S = { night: o.night, lane: 1, dist: spec.dist, spec, viewStyle: car.view, color: car.color, accent: car.accent, autoShift: false, camX: o.camXFt, pitch: o.pitch, shake: o.shake, speedMph: o.mph,
    tree: { left: Object.assign({}, L), right: Object.assign({}, L) },
    opp: o.oppAhead === null ? null : { x: o.camXFt + o.oppAhead, id: carId, view: car.view, color: '#B02A2A', accent: '#eee', spinning: o.spinning, progress: Math.max(0, o.camXFt + o.oppAhead) },
    player: { progress: Math.max(0, o.camXFt + 6) }, board: { me: o.board ? { et: '12.241', mph: '114.40' } : null, opp: o.board ? { et: '12.226', mph: '115.10' } : null },
    hud: { rpm: o.rpm, mph: o.mph, limiter: false, shifting: false, gearLabel: String(o.gear), opt: spec.optShift[o.gear - 1] || null, rt: o.lights === 'run' ? '0.031' : '—', et: o.lights === 'run' ? '4.120' : '0.000', heatBar: o.heat, msg: o.msg, sub: null, status: o.status }, safeTop: 47, safeLeft: 0, safeRight: 0, safeBottom: 34 };
  return S;
}
const shots = {
  staged_day_gt: scene('gt', { lights: 'amber' }),
  run_day_gt: scene('gt', { lights: 'run', camXFt: 300, mph: 92, rpm: 6200, gear: 3, oppAhead: 25, shake: 0.2 }),
  run_night_prostock: scene('prostock', { night: true, lights: 'run', camXFt: 600, mph: 170, rpm: 9800, gear: 4, oppAhead: -5, shake: 0.4 }),
  staged_night_topfuel: scene('topfuel', { night: true, lights: 'staged', oppAhead: 12 }),
  finish_day_demon: scene('demon', { lights: 'run', camXFt: 1250, mph: 150, rpm: 6000, gear: 5, oppAhead: 40, board: true }),
  burnout_day_hellcat: scene('hellcat', { lights: 'staged', oppAhead: 12, heat: 0.8, status: { text: 'COLD TIRES', col: '#ffb000' }, rpm: 4000 }),
};
const want = process.argv[4] ? process.argv[4].split(',') : Object.keys(shots);
for (const k of want) {
  if (!shots[k]) continue;
  const S = shots[k];
  for (let i = 0; i < 3; i++) R.stepParticles(0.016);
  R.drawScene(S);
  fs.writeFileSync(`/tmp/shot_${k}.png`, cv.toBuffer('image/png'));
  console.log('wrote', `/tmp/shot_${k}.png`);
}
// close-ups of the rival for each body style
if (process.argv[4] === 'rivals') {
  const specs = [['gt', 45], ['hellcat', 45], ['z06', 100], ['prostock', 45], ['funny', 45], ['topfuel', 45], ['gt', -20], ['demon', 180]];
  const out = [];
  for (const [id, ahead] of specs) {
    const S = scene(id, { lights: 'run', camXFt: 200, mph: 90, rpm: 6000, gear: 3, oppAhead: ahead });
    R.drawScene(S); const name = `/tmp/rival_${id}_${ahead}.png`; fs.writeFileSync(name, cv.toBuffer('image/png')); out.push(name);
  }
  console.log(out.join(' '));
}
