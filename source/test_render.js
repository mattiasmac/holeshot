const fs = require('fs');
const PH = require('./10_physics.js'); global.PH = PH;
global.window = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 2 };
global.document = { documentElement: {} };
const calls = {};
const ctx = new Proxy({}, { get(t, k) { if (k === 'canvas') return null; if (['fillStyle','strokeStyle','lineWidth','globalAlpha','font','textAlign','textBaseline','shadowBlur','shadowColor','lineCap'].includes(k)) return t[k]; return (...a) => { calls[k] = (calls[k] || 0) + 1; if (k === 'createLinearGradient') return { addColorStop() {} }; if (k === 'measureText') return { width: 10 }; }; }, set(t, k, v) { t[k] = v; return true; } });
const cv = { getContext: () => ctx, style: {} };
const src = fs.readFileSync('30_render.js', 'utf8');
const R = new Function('PH', 'window', 'document', src + '; return R;')(PH, global.window, global.document);
R.attach(cv);
for (const car of PH.CARS) {
  const spec = PH.buildSpec(car, {}, {});
  const run = PH.simulate(spec);
  for (const night of [false, true]) for (const camXFt of [-7, 50, 700, 1400]) {
    const S = { night, lane: 1, dist: spec.dist, spec, viewStyle: car.view, color: car.color, accent: car.accent, autoShift: false, camX: camXFt, pitch: 0.2, shake: 0.3, speedMph: 150,
      tree: { left: { pre: true, stage: true, a1: true, a2: false, a3: false, green: false, red: false }, right: { pre: true, stage: true, a1: false, a2: false, a3: false, green: true, red: false } },
      opp: { x: camXFt + 30, view: car.view, color: '#B02A2A', accent: '#eee', spinning: true, progress: 100 }, player: { progress: 90 }, board: { me: { et: '6.550', mph: '212.00' }, opp: null },
      hud: { rpm: 6500, mph: 150, limiter: true, shifting: false, gearLabel: '3', opt: spec.optShift[0] || null, rt: '0.021', et: '4.120', heatBar: 1.0, msg: { text: 'PERFECT SHIFT', col: '#2be35a', t: 1 }, sub: { text: 'x', t: 1 }, status: { text: 'WHEELSPIN', col: '#f00' } }, safeTop: 44, safeLeft: 0, safeRight: 0 };
    R.spawnSmoke(100, 100, 5, 30, 0, 0); R.stepParticles(0.016);
    R.drawScene(S);
  }
}
console.log('render OK; draw calls:', Object.keys(calls).length, 'kinds; fillText', calls.fillText, 'arc', calls.arc);
