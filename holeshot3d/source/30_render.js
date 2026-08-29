/* ===================== renderer ===================== */
const R = (function () {
  const FT = PH.FT_M;
  let cv, ctx, W = 390, H = 844, dpr = 1, portrait = true;
  const cam = { f: 400, h: 3.6, horizon: 330, cx: 195 };
  const particles = [];
  const clamp = PH.clamp, lerp = PH.lerp;
  // deterministic pseudo-random for static scenery
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // asphalt grains (world-periodic), tire marks, crowd colours, stars, clouds
  const GRAIN_P = 160, grains = [];
  for (let i = 0; i < 520; i++) grains.push({ u: rnd() * GRAIN_P, x: -14.5 + rnd() * 29, r: 0.05 + rnd() * 0.14, b: rnd() });
  const marks = []; for (let i = 0; i < 26; i++) { const ln = i % 2 ? 1 : -1; marks.push({ x0: (i < 16 ? 2 : 1300) + rnd() * (i < 16 ? 110 : 120), len: 6 + rnd() * 30, lat: ln * 6.5 + (rnd() < 0.5 ? -1 : 1) * (2.3 + rnd() * 1.2), w: 0.5 + rnd() * 0.5, a: 0.15 + rnd() * 0.25 }); }
  const CROWD = ['#e8d9c0', '#c9a27a', '#7a5a3c', '#3c3c3c', '#d8443b', '#3b6bd8', '#e6c93c', '#f2f2f2', '#2f8f4a'];
  const crowd = []; for (let i = 0; i < 560; i++) crowd.push({ u: rnd() * 100, row: Math.floor(rnd() * 7), c: CROWD[Math.floor(rnd() * CROWD.length)], s: 0.35 + rnd() * 0.25 });
  const stars = []; for (let i = 0; i < 90; i++) stars.push({ x: rnd(), y: rnd() * 0.75, r: 0.4 + rnd() * 1.0, a: 0.3 + rnd() * 0.7 });
  const clouds = []; for (let i = 0; i < 7; i++) clouds.push({ x: rnd(), y: 0.12 + rnd() * 0.55, w: 0.18 + rnd() * 0.22, h: 0.035 + rnd() * 0.03, a: 0.35 + rnd() * 0.35 });
  const BANNERS = ['#1d4fb8', '#c8102e', '#e0b100', '#1c8f4e', '#f26a1b', '#5b2a86'];
  const shadeCache = {}; function shadeC(hex, k) { const key = hex + k; return shadeCache[key] || (shadeCache[key] = shade(hex, k)); }

  // Optional photo/render assets: assets/car/<id>.png (rear view, transparent, ground at the bottom edge),
  // assets/hood/<id>.png (your own hood/cowl seen from the seat, transparent above the hood line).
  // Missing files fall back to the drawn versions, so the game runs with or without them.
  const Assets = { car: {}, hood: {} };
  function asset(kind, id) {
    const cache = Assets[kind]; if (cache[id] !== undefined) return cache[id] || null;
    if (typeof Image === 'undefined') { cache[id] = null; return null; }
    cache[id] = false; const im = new Image(); im.onload = () => { cache[id] = im; }; im.onerror = () => { cache[id] = null; };
    try { im.src = `assets/${kind}/${id}.png`; } catch (e) { cache[id] = null; }
    return null;
  }
  let gl3d = false;
  function attach(canvas, glCanvas, use3D) {
    cv = canvas;
    gl3d = !!(use3D && glCanvas && typeof GL !== 'undefined' && GL.init(glCanvas));
    ctx = cv.getContext('2d', { alpha: gl3d });
    if (glCanvas) glCanvas.style.display = gl3d ? 'block' : 'none';
    resize();
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    portrait = H >= W;
    if (gl3d) GL.resize(W, H);
  }
  function proj(d, x, z) { return [cam.cx + cam.f * x / d, cam.horizon + cam.f * (cam.h - z) / d]; }
  function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(hex, k, add) { const [r, g, b] = hexRgb(hex); add = add || 0; return `rgb(${clamp(Math.round(r * k + add), 0, 255)},${clamp(Math.round(g * k + add), 0, 255)},${clamp(Math.round(b * k + add), 0, 255)})`; }
  function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
  function poly(pts, fill, stroke, lw) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); } }
  function rrect(x, y, w, h, r, fill) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } }
  function glow(x, y, r, col, a) { if (r <= 0) return; const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }

  /* ---------- particles ---------- */
  function spawnSmoke(sx, sy, n, size, vx, vy, dark) {
    for (let i = 0; i < n; i++) particles.push({ x: sx + (Math.random() - 0.5) * size, y: sy + (Math.random() - 0.5) * size * 0.4, vx: vx + (Math.random() - 0.5) * 40, vy: vy - Math.random() * 30, r: size * (0.4 + Math.random() * 0.6), a: 0.5, life: 1.2 + Math.random() * 0.8, dark: !!dark });
  }
  function stepParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += 40 * dt; p.a *= Math.pow(0.35, dt);
      if (p.life <= 0 || p.a < 0.02) particles.splice(i, 1);
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
  }
  function drawParticles(night) {
    for (const p of particles) {
      const c = p.dark ? (night ? '#26262a' : '#4a4a50') : (night ? '#9a9aa2' : '#eeeef2');
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, rgba(c, Math.min(0.55, p.a))); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
  }

  /* ---------- scene ---------- */
  const LANE = 6.5; // lane centre offset from the centreline (ft)
  let laneX = 0, camX = 0, dNear = 2, maxD = 2600, night = false;
  const L = (x, z, d) => proj(d, x - laneX, z || 0);
  function trk(xa, xb, from, to, fill) { // ground patch between world x from..to (ft)
    const d0 = Math.max(dNear, from - camX), d1 = Math.min(maxD, to - camX);
    if (d1 <= d0) return;
    poly([L(xa, 0, d1), L(xb, 0, d1), L(xb, 0, d0), L(xa, 0, d0)], fill);
  }
  function drawScene(S) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    night = S.night;
    const view = S.viewStyle || 'car';
    const dashTop = portrait ? H * 0.64 : H * 0.66;
    cam.f = W * (portrait ? 0.85 : 0.72);
    cam.h = view === 'dragster' ? 2.3 : view === 'funny' ? 3.0 : 3.5;
    const baseHorizon = (portrait ? 0.40 : 0.42) * H;
    const pitch = S.pitch || 0, shk = S.shake || 0;
    const shx = (Math.random() - 0.5) * 2 * shk * 7, shy = (Math.random() - 0.5) * 2 * shk * 5;
    cam.horizon = baseHorizon + pitch * H * 0.06 + shy;
    cam.cx = W / 2 + shx;
    camX = S.camX; laneX = S.lane * LANE;
    dNear = Math.max(1.5, cam.f * cam.h / (H - cam.horizon));
    if (gl3d) {
      S.W = W; S.H = H; S.f = cam.f; S.cx = cam.cx; S.horizon = cam.horizon; S.camH = cam.h;
      GL.render(S);
      ctx.clearRect(0, 0, W, H);
    } else {
      drawSky();
      drawFar();
      drawTrack(S);
      drawWalls(S);
      drawScenery(S);
      drawMarkers(S);
      drawScoreboards(S);
      drawTree3D(S);
      if (S.opp) drawOpponent(S);
      drawHaze();
    }
    drawSpeed(S);
    drawParticles(night);
    drawCockpit(S, dashTop);
    drawHUD(S, dashTop, night);
  }
  function drawSky() {
    const hz = cam.horizon;
    let g = ctx.createLinearGradient(0, 0, 0, hz);
    if (night) { g.addColorStop(0, '#04050a'); g.addColorStop(0.55, '#0a0d1a'); g.addColorStop(0.9, '#2a2418'); g.addColorStop(1, '#5a4a2a'); }
    else { g.addColorStop(0, '#3f7fcf'); g.addColorStop(0.5, '#7fb1e6'); g.addColorStop(0.85, '#c7dcee'); g.addColorStop(1, '#e9e4d6'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz + 2);
    if (night) { for (const s of stars) { ctx.globalAlpha = s.a * 0.8; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(s.x * W, s.y * hz, s.r, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
    else {
      glow(W * 0.82, hz * 0.22, W * 0.5, '#fff4d6', 0.55);
      for (const c of clouds) { ctx.globalAlpha = c.a; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(c.x * W, c.y * hz, c.w * W, c.h * hz, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(c.x * W - c.w * W * 0.35, c.y * hz + c.h * hz * 0.5, c.w * W * 0.55, c.h * hz * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(c.x * W + c.w * W * 0.4, c.y * hz + c.h * hz * 0.4, c.w * W * 0.5, c.h * hz * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }
  function drawFar() {
    ctx.fillStyle = night ? '#0d0f0c' : '#5d6e36'; ctx.fillRect(0, cam.horizon - 1, W, H - cam.horizon + 1);
    const [x0, y0] = L(0, 22, maxD);
    ctx.fillStyle = night ? '#080a0c' : '#3a5530'; ctx.fillRect(0, y0, W, cam.horizon - y0 + 2);
    ctx.fillStyle = night ? '#07090b' : '#33502c'; let x = 0; let i = 0;
    while (x < W) { const w = 10 + ((i * 37) % 19), hh = 3 + ((i * 53) % 7); ctx.beginPath(); ctx.ellipse(x + w / 2, y0 + 1, w * 0.6, hh, 0, Math.PI, 0); ctx.fill(); x += w * 0.8; i++; }
    ctx.fillRect(0, y0 + 1, W, cam.horizon - y0 + 1);
  }
  function drawTrack(S) {
    const finish = S.dist;
    const gA = ctx.createLinearGradient(0, cam.horizon, 0, H);
    if (night) { gA.addColorStop(0, '#16171b'); gA.addColorStop(0.2, '#1c1d22'); gA.addColorStop(1, '#26272d'); }
    else { gA.addColorStop(0, '#6d6d70'); gA.addColorStop(0.15, '#4a4b4f'); gA.addColorStop(1, '#3a3b3f'); }
    trk(-15, 15, camX - 120, camX + maxD, gA);
    trk(-15, 15, -90, 330, night ? '#2b2c30' : '#8e8c86');
    ctx.strokeStyle = night ? '#1f2024' : '#6f6d67'; ctx.lineWidth = 1;
    for (let jx = -90; jx <= 330; jx += 15) { const d = jx - camX; if (d < dNear || d > 600) continue; const [x1, y1] = L(-15, 0, d), [x2, y2] = L(15, 0, d); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    for (const ln of [-1, 1]) for (const side of [-1, 1]) {
      const c = ln * LANE + side * 2.9;
      trk(c - 1.6, c + 1.6, -40, 1400, night ? 'rgba(6,6,8,.45)' : 'rgba(20,20,22,.45)');
      trk(c - 1.0, c + 1.0, -40, 1400, night ? 'rgba(4,4,6,.55)' : 'rgba(14,14,16,.6)');
      trk(c - 0.25, c + 0.25, -40, 1400, night ? 'rgba(70,70,80,.10)' : 'rgba(180,180,190,.08)');
    }
    const maxGrainD = 420;
    for (const g of grains) {
      let wx = camX + ((g.u - camX) % GRAIN_P + GRAIN_P) % GRAIN_P;
      for (; wx < camX + maxGrainD; wx += GRAIN_P) {
        const d = wx - camX; if (d < dNear) continue;
        const s = cam.f / d, [px, py] = L(g.x, 0, d);
        const lum = night ? 30 + g.b * 40 : 70 + g.b * 90;
        ctx.fillStyle = `rgba(${lum},${lum},${lum + 4},${clamp(0.6 - d / maxGrainD, 0.04, 0.45)})`;
        ctx.fillRect(px - g.r * s, py - g.r * s * 0.35, g.r * s * 2 + 0.6, g.r * s * 0.7 + 0.6);
      }
    }
    for (const m of marks) trk(m.lat - m.w, m.lat + m.w, m.x0, m.x0 + m.len, `rgba(10,10,12,${m.a})`);
    trk(-0.35, 0.35, -110, camX + maxD, night ? '#5a5748' : '#dcd6c2');
    trk(-14.5, -14.1, -110, camX + maxD, night ? '#46443b' : '#cfc9b6');
    trk(14.1, 14.5, -110, camX + maxD, night ? '#46443b' : '#cfc9b6');
    trk(-14, 14, -0.7, 0.7, '#ece7d6');
    trk(-14, 14, finish - 0.9, finish + 0.9, '#ffffff');
    for (let i = 0; i < 8; i++) trk(-14 + i * 3.5, -14 + i * 3.5 + 1.75, finish + 1.5, finish + 6, i % 2 ? '#f4f4f4' : '#141414');
    for (let i = 0; i < 8; i++) trk(-14 + i * 3.5 + 1.75, -14 + i * 3.5 + 3.5, finish + 6, finish + 10.5, i % 2 ? '#f4f4f4' : '#141414');
    if (night) {
      for (let px = 0; px <= 1800; px += 120) {
        const d = px - camX; if (d < dNear || d > 900) continue;
        const [cx, cy] = L(0, 0, d); const s = cam.f / d;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 46); g.addColorStop(0, `rgba(255,240,200,${0.16 * (1 - d / 900)})`); g.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, s * 46, s * 5, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  function drawWalls(S) {
    const face = night ? '#3b3b3e' : '#cbc6b8', faceShade = night ? '#2c2c2f' : '#a9a496', top = night ? '#585853' : '#e8e4d8', base = night ? '#1a1a1c' : '#7d7a70';
    for (const side of [-1, 1]) {
      const inner = side * 15, outer = side * 16.2, d0 = dNear, d1 = maxD;
      const col = side === -1 ? face : faceShade;
      poly([L(inner, 0, d1), L(inner, 2.6, d1), L(inner, 2.6, d0), L(inner, 0, d0)], col);
      poly([L(inner, 0.45, d1), L(inner, 0.6, d1), L(inner, 0.6, d0), L(inner, 0.45, d0)], base);
      poly([L(inner, 2.6, d1), L(outer, 2.8, d1), L(outer, 2.8, d0), L(inner, 2.6, d0)], top);
      const start = Math.floor(camX / 60) * 60;
      for (let wx = start; wx < camX + 700; wx += 60) {
        const d = wx - camX, dd = wx + 28 - camX; if (dd < dNear) continue;
        const k = Math.abs(Math.floor(wx / 60)) % BANNERS.length; if (k % 2) continue;
        poly([L(inner, 1.0, Math.max(dNear, d)), L(inner, 2.2, Math.max(dNear, d)), L(inner, 2.2, dd), L(inner, 1.0, dd)], shade(BANNERS[k], night ? 0.5 : 1));
        poly([L(inner, 1.15, Math.max(dNear, d + 2)), L(inner, 1.35, Math.max(dNear, d + 2)), L(inner, 1.35, dd - 2), L(inner, 1.15, dd - 2)], night ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.75)');
      }
      ctx.strokeStyle = night ? '#232326' : '#8f8c82'; ctx.lineWidth = 1;
      for (let wx = Math.floor(camX / 20) * 20; wx < camX + 400; wx += 20) { const d = wx - camX; if (d < dNear) continue; const [x1, y1] = L(inner, 0, d), [x2, y2] = L(inner, 2.6, d); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    }
  }
  function drawScenery(S) {
    const k = night ? 0.4 : 1;
    for (let gx = 80; gx < 1300; gx += 100) {
      const d0 = gx - camX, d1 = gx + 96 - camX; if (d1 < dNear || d0 > maxD) continue;
      const dd0 = Math.max(dNear, d0), dd1 = Math.min(maxD, d1);
      poly([L(-22, 0, dd1), L(-22, 6, dd1), L(-22, 6, dd0), L(-22, 0, dd0)], shade('#7d7a72', k));
      poly([L(-22, 6, dd1), L(-22, 6.6, dd1), L(-22, 6.6, dd0), L(-22, 6, dd0)], shade('#3a3a3c', k)); // fence rail
      poly([L(-22, 6, dd1), L(-72, 30, dd1), L(-72, 30, dd0), L(-22, 6, dd0)], shade('#6a6760', k));
      for (let r = 0; r < 7; r++) {
        const xa = -28 - r * 6.2, xb = -33 - r * 6.2, za = 9.5 + r * 3, zb = 11.5 + r * 3;
        poly([L(xa, za, dd1), L(xb, zb, dd1), L(xb, zb, dd0), L(xa, za, dd0)], shade(r % 2 ? '#2d5fb3' : '#c62d34', k));
      }
      poly([L(-72, 30, dd1), L(-72, 33, dd1), L(-72, 33, dd0), L(-72, 30, dd0)], shade('#4a4843', k));
      poly([L(-71, 33, dd1), L(-36, 37, dd1), L(-36, 37, dd0), L(-71, 33, dd0)], shade('#6f6e6a', k)); // roof underside
      for (let c = 0; c < 2; c++) { const dc = gx + 20 + c * 50 - camX; if (dc < dNear) continue; const [c1x, c1y] = L(-36, 37, dc), [c2x, c2y] = L(-36, 20, dc); ctx.strokeStyle = shade('#55544f', k); ctx.lineWidth = Math.max(1, cam.f / dc * 0.6); ctx.beginPath(); ctx.moveTo(c1x, c1y); ctx.lineTo(c2x, c2y); ctx.stroke(); }
      if (d0 < 380) for (const c of crowd) { const wx = gx + c.u; const d = wx - camX; if (d < dNear || d > 380) continue; const s = cam.f / d; const r = clamp(s * c.s, 0.7, 4); const [px, py] = L(-27.5 - c.row * 6.2, 11 + c.row * 3, d); ctx.fillStyle = shadeC(c.c, k); ctx.fillRect(px - r, py - r, r * 2, r * 2); }
    }
    // smaller bleachers on the right, 260..860 ft
    for (let gx = 260; gx < 860; gx += 100) {
      const d0 = gx - camX, d1 = gx + 90 - camX; if (d1 < dNear || d0 > maxD) continue;
      const dd0 = Math.max(dNear, d0), dd1 = Math.min(maxD, d1);
      poly([L(21, 0, dd1), L(21, 4, dd1), L(21, 4, dd0), L(21, 0, dd0)], shade('#7d7a72', k));
      for (let r = 0; r < 4; r++) { const xa = 23 + r * 5, xb = 27 + r * 5, za = 4.5 + r * 2.4, zb = 6 + r * 2.4; poly([L(xa, za, dd1), L(xb, zb, dd1), L(xb, zb, dd0), L(xa, za, dd0)], shade(r % 2 ? '#8f8f93' : '#7a7a7e', k)); }
      if (d0 < 320) for (let i = 0; i < crowd.length; i += 2) { const c = crowd[i]; if (c.row > 3) continue; const wx = gx + c.u * 0.9; const d = wx - camX; if (d < dNear || d > 320) continue; const sc = cam.f / d; const r = clamp(sc * c.s, 0.7, 4); const [px, py] = L(24.5 + c.row * 5, 6 + c.row * 2.4, d); ctx.fillStyle = shadeC(c.c, k); ctx.fillRect(px - r, py - r, r * 2, r * 2); }
    }
    {
      const d0 = -60 - camX, d1 = -25 - camX;
      if (d1 > dNear) {
        const dd0 = Math.max(dNear, d0);
        poly([L(19, 0, d1), L(19, 22, d1), L(19, 22, dd0), L(19, 0, dd0)], shade('#d7d3c8', k));
        poly([L(19, 0, dd0), L(19, 22, dd0), L(33, 22, dd0), L(33, 0, dd0)], shade('#b5b1a6', k));
        for (let f = 0; f < 3; f++) for (let w = 0; w < 5; w++) { const wx = -56 + w * 6.5; const dw = wx - camX; if (dw < dNear) continue; poly([L(19, 3 + f * 6.5, dw), L(19, 7.5 + f * 6.5, dw), L(19, 7.5 + f * 6.5, dw + 4), L(19, 3 + f * 6.5, dw + 4)], night ? '#ffe9b0' : '#7fa2c9'); }
        poly([L(19, 22, d1), L(19, 24, d1), L(19, 24, dd0), L(19, 22, dd0)], shade('#3a3a3a', k));
      }
    }
    for (let px = 0; px <= 1800; px += 120) {
      const d = px - camX; if (d < dNear || d > maxD) continue;
      const s = cam.f / d;
      for (const side of [-1, 1]) {
        const xw = side * 19.5;
        const [x1, y1] = L(xw, 0, d), [x2, y2] = L(xw, 42, d);
        ctx.strokeStyle = night ? '#2a2b2e' : '#5b5d62'; ctx.lineWidth = Math.max(1, s * 0.5); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.fillStyle = night ? '#fff7dc' : '#dfe2e6'; ctx.fillRect(x2 - s * 3 * (side > 0 ? 1 : 0), y2 - s * 0.9, s * 3, s * 1.3);
        if (night && s > 0.15) glow(x2 - s * 1.5 * side, y2, s * 9 + 6, '#ffe6a3', 0.45);
      }
    }
  }
  function drawMarkers(S) {
    const list = [60, 330, 660, 1000, 1320].filter(b => b <= S.dist);
    for (const b of list) {
      const d = b - camX; if (d < dNear || d > maxD) continue;
      const s = cam.f / d;
      for (const side of [-1, 1]) {
        const [cx, cy] = L(side * 13.3, 0, d);
        poly([[cx, cy - s * 2.3], [cx + s * 0.85, cy], [cx - s * 0.85, cy]], '#ff6a1a'); ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - s * 0.4, cy - s * 1.4, s * 0.8, s * 0.35);
        const [bx, by] = L(side * 14.2, 0, d);
        rrect(bx - s * 0.55, by - s * 1.5, s * 1.1, s * 1.5, s * 0.15, '#f4f4f4'); ctx.fillStyle = '#222'; ctx.fillRect(bx - s * 0.2, by - s * 1.1, s * 0.4, s * 0.4);
      }
      const [tx, ty] = L(-15.8, 5.2, d); const bw = s * 9.5, bh = s * 3.4;
      if (bw > 4) { rrect(tx - bw / 2, ty - bh / 2, bw, bh, s * 0.2, '#161616'); txt(b === 1320 ? '1320' : b === 1000 && S.dist === 1000 ? '1000' : String(b), tx, ty + bh * 0.04, Math.max(6, bh * 0.7), '#ffd24a', 'center', DISPLAY, 700); }
    }
  }
  function drawScoreboards(S) {
    const d = S.dist + 90 - camX; if (d < dNear || d > maxD) return;
    const s = cam.f / d;
    for (const side of [-1, 1]) {
      // boards stand outside the walls, one per lane, on a post planted beside the track
      const [px1, py1] = L(side * 21, 0, d), [px2, py2] = L(side * 21, 20, d);
      ctx.strokeStyle = '#2b2b2e'; ctx.lineWidth = Math.max(1, s * 0.9); ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke();
      ctx.fillStyle = '#3a3a3e'; ctx.beginPath(); ctx.ellipse(px1, py1, s * 1.6, s * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      const bw = s * 16, bh = s * 9;
      rrect(px2 - bw / 2, py2 - bh, bw, bh, s * 0.3, '#0c0c10'); ctx.strokeStyle = '#3d3d44'; ctx.lineWidth = 1; ctx.strokeRect(px2 - bw / 2, py2 - bh, bw, bh);
      const sb = side === S.lane ? S.board.me : S.board.opp;
      if (bw > 14) {
        if (night) glow(px2, py2 - bh / 2, bw * 0.8, '#ffb000', 0.18);
        txt(sb && sb.et ? sb.et : '- - -', px2, py2 - bh * 0.68, bh * 0.36, '#ffb000', 'center', MONO, 700);
        txt(sb && sb.mph ? sb.mph : '- - -', px2, py2 - bh * 0.3, bh * 0.36, '#ffb000', 'center', MONO, 700);
      }
    }
  }
  function drawHaze() {
    const hz = cam.horizon; const g = ctx.createLinearGradient(0, hz - 2, 0, hz + 60);
    const c = night ? '#2a2418' : '#e6e1d3'; g.addColorStop(0, rgba(c, night ? 0.5 : 0.7)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(0, hz - 2, W, 62);
  }
  function drawSpeed(S) {
    if (S.speedMph < 80) return;
    const k = clamp((S.speedMph - 80) / 260, 0, 0.55);
    const g1 = ctx.createLinearGradient(0, 0, W * 0.35, 0); g1.addColorStop(0, `rgba(255,255,255,${k * 0.22})`); g1.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g1; ctx.fillRect(0, cam.horizon - 40, W * 0.35, H * 0.3);
    const g2 = ctx.createLinearGradient(W, 0, W * 0.65, 0); g2.addColorStop(0, `rgba(255,255,255,${k * 0.22})`); g2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g2; ctx.fillRect(W * 0.65, cam.horizon - 40, W * 0.35, H * 0.3);
  }

  /* ---------- tree ---------- */
  const AMB = '#FFB000', GRN = '#2BE35A', RED = '#FF2A3D', PRE = '#FFD84A';
  function bulb(x, y, r, on, col) {
    if (on) glow(x, y, r * (night ? 3.2 : 2.0), col, night ? 0.55 : 0.35);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = on ? col : (night ? '#1a1a1d' : '#3a3a3f'); ctx.fill();
    if (on) { ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill(); }
    else if (r > 2) { ctx.strokeStyle = '#0d0d0f'; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function treeColumn(x, y, r, gap, st) {
    bulb(x - r * 0.55, y, r * 0.45, st.pre, PRE); bulb(x + r * 0.55, y, r * 0.45, st.pre, PRE);
    bulb(x - r * 0.55, y + gap * 0.8, r * 0.45, st.stage, PRE); bulb(x + r * 0.55, y + gap * 0.8, r * 0.45, st.stage, PRE);
    bulb(x, y + gap * 2.0, r, st.a1, AMB); bulb(x, y + gap * 3.2, r, st.a2, AMB); bulb(x, y + gap * 4.4, r, st.a3, AMB);
    bulb(x, y + gap * 5.6, r, st.green, GRN); bulb(x, y + gap * 6.8, r, st.red, RED);
  }
  function drawTree3D(S) {
    const d = 15 - camX; if (d < 2.5) return;
    const s = cam.f / d;
    const [px, py] = L(0, 9.5, d);
    const r = s * 0.55, gap = s * 1.05;
    const [bx, by] = L(0, 0, d);
    ctx.strokeStyle = '#2a2a2d'; ctx.lineWidth = Math.max(1, s * 0.3); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(px, py + gap * 7.6); ctx.stroke();
    ctx.fillStyle = '#26262a'; ctx.beginPath(); ctx.ellipse(bx, by, s * 1.2, s * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    rrect(px - s * 2.5, py - r * 1.3, s * 5, gap * 7.6 + r * 1.6, s * 0.25, '#121214');
    ctx.fillStyle = '#1e1e22'; ctx.fillRect(px - s * 0.12, py - r * 1.3, s * 0.24, gap * 7.6 + r * 1.6);
    treeColumn(px - s * 1.2, py, r, gap, S.tree.left);
    treeColumn(px + s * 1.2, py, r, gap, S.tree.right);
  }

  /* ---------- opponent car ---------- */
  const SHAPES = {
    ctr: { w: 6.1, h: 4.5, cabW: 4.8, cabH: 1.6, wing: 1, wingH: 4.7, tire: [0.85, 2.15], tl: 'twin' },
    gt: { w: 6.3, h: 4.4, cabW: 4.6, cabH: 1.5, wing: 0, tire: [0.95, 2.3], tl: 'tri' },
    gtr: { w: 6.2, h: 4.3, cabW: 4.6, cabH: 1.4, wing: 1, wingH: 4.5, tire: [1.0, 2.35], tl: 'round' },
    hellcat: { w: 6.5, h: 4.6, cabW: 4.9, cabH: 1.5, wing: 1, wingH: 4.5, tire: [1.05, 2.4], tl: 'bar' },
    z06: { w: 6.6, h: 3.9, cabW: 4.3, cabH: 1.3, wing: 1, wingH: 4.2, tire: [1.1, 2.3], tl: 'round' },
    plaid: { w: 6.4, h: 4.6, cabW: 4.8, cabH: 1.5, wing: 0, tire: [0.9, 2.35], tl: 'bar' },
    demon: { w: 6.7, h: 4.6, cabW: 4.9, cabH: 1.5, wing: 1, wingH: 4.5, tire: [1.2, 2.55], tl: 'bar' },
  };
  function drawOpponent(S) {
    const o = S.opp; const d = o.x - camX - 2; if (d < 2.2 || d > 2400) return;
    const s = cam.f / (d + 6), xw = -S.lane * LANE - laneX;
    const k = night ? 0.5 : 1;
    const view = o.view || 'car';
    const [cx, cy] = L(xw, 0, d + 6);
    const shg = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 5); shg.addColorStop(0, 'rgba(0,0,0,.6)'); shg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shg; ctx.beginPath(); ctx.ellipse(cx, cy, s * 5.2, s * 1.2, 0, 0, Math.PI * 2); ctx.fill();
    const sideK = clamp((13 / (d + 6)) * 0.9, 0, 0.9);
    const photo = o.id ? asset('car', o.id) : null;
    if (photo) { // real rear-view image: width scaled to the car's footprint, resting on the ground line
      const iw = s * (view === 'dragster' ? 9.6 : 7.0), ih = iw * photo.height / photo.width;
      ctx.drawImage(photo, cx - iw / 2, cy - ih, iw, ih);
      if (night) { ctx.globalAlpha = 0.45; ctx.fillStyle = '#000'; ctx.fillRect(cx - iw / 2, cy - ih, iw, ih); ctx.globalAlpha = 1; }
      if (o.spinning && d < 400) spawnSmoke(cx, cy - s * 0.4, 1, s * 3.5, 0, -10, false);
      return;
    }
    if (view === 'dragster') drawDragsterRear(cx, cy, s, o, k, sideK);
    else if (view === 'funny') drawFunnyRear(cx, cy, s, o, k, sideK);
    else if (view === 'scoop') drawDoorCarRear(cx, cy, s, o, k, sideK, true);
    else drawDoorCarRear(cx, cy, s, o, k, sideK, false, SHAPES[o.id] || SHAPES.gt);
    if (o.spinning && d < 400) spawnSmoke(cx, cy - s * 0.4, 1, s * 3.5, 0, -10, false);
  }
  function tire(x, y, w, h, s, k) {
    rrect(x - w / 2, y - h, w, h, w * 0.2, '#0e0e10');
    ctx.fillStyle = shade('#2a2a2e', k); ctx.fillRect(x - w * 0.38, y - h * 0.95, w * 0.76, h * 0.9);
    ctx.fillStyle = shade('#151517', k); for (let i = 1; i < 5; i++) ctx.fillRect(x - w * 0.34, y - h * (0.95 - i * 0.18), w * 0.68, Math.max(0.6, s * 0.06));
  }
  function taillight(x, y, w, h, on, k) { glow(x, y, w * 1.4, '#ff2a1a', night ? 0.45 : 0.18); rrect(x - w / 2, y - h / 2, w, h, h * 0.3, shade(on ? '#ff3b2f' : '#b41f1a', k + 0.2)); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x - w / 2 + w * 0.08, y - h * 0.35, w * 0.84, h * 0.2); }
  function drawDoorCarRear(cx, cy, s, o, k, sideK, pro, sh) {
    sh = sh || { w: 6.5, h: 3.9, cabW: 4.5, cabH: 1.35, wing: 1, wingH: 4.6, tire: [1.5, 2.8], tl: 'twin' };
    const col = o.color, accent = o.accent || '#eeeeee';
    const w = s * sh.w, h = s * sh.h, bodyTop = cy - h;
    const tw = s * sh.tire[0], th = s * sh.tire[1];
    if (sideK > 0.05) {
      const len = s * 13 * sideK;
      poly([[cx + w / 2, cy - s * 0.9], [cx + w / 2, bodyTop + s * 0.4], [cx + w / 2 + len * 0.75, bodyTop + s * 0.9 - len * 0.03], [cx + w / 2 + len, cy - s * 1.0 - len * 0.06]], shade(col, k * 0.72));
      poly([[cx + w / 2, bodyTop + s * 0.4], [cx + w / 2 + len * 0.75, bodyTop + s * 0.9 - len * 0.03], [cx + w / 2 + len * 0.72, bodyTop + s * (sh.cabH + 0.5) - len * 0.03], [cx + w / 2 - s * 0.2, bodyTop + s * sh.cabH]], shade('#1a1f26', k));
      ctx.fillStyle = '#0d0d0f'; ctx.beginPath(); ctx.ellipse(cx + w / 2 + len * 0.82, cy - s * 0.3 - len * 0.05, tw * 0.45, th * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    tire(cx - w / 2 + tw * 0.55, cy, tw, th, s, k); tire(cx + w / 2 - tw * 0.55, cy, tw, th, s, k);
    const gB = ctx.createLinearGradient(0, bodyTop, 0, cy); gB.addColorStop(0, shade(col, k * 1.15, 30)); gB.addColorStop(0.35, shade(col, k)); gB.addColorStop(0.8, shade(col, k * 0.75)); gB.addColorStop(1, shade(col, k * 0.5));
    rrect(cx - w / 2, bodyTop + s * sh.cabH * 0.95, w, h - s * sh.cabH * 0.95 - s * 0.35, s * 0.35, gB);
    rrect(cx - w * 0.46, cy - s * 1.15, w * 0.92, s * 0.55, s * 0.15, shade('#1b1b1e', k));
    const cw = s * sh.cabW, ch = s * sh.cabH;
    rrect(cx - cw / 2, bodyTop, cw, ch + s * 0.4, s * 0.45, shade(col, k * 0.95));
    const gG = ctx.createLinearGradient(cx - cw / 2, bodyTop, cx + cw / 2, bodyTop + ch); gG.addColorStop(0, shade('#2b3340', k)); gG.addColorStop(0.45, shade('#6f8296', k)); gG.addColorStop(0.55, shade('#1e252d', k)); gG.addColorStop(1, shade('#141a20', k));
    rrect(cx - cw * 0.44, bodyTop + s * 0.18, cw * 0.88, ch * 0.85, s * 0.3, gG);
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(cx - cw * 0.4, bodyTop + s * 0.05, cw * 0.8, Math.max(1, s * 0.12));
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(cx - w * 0.46, bodyTop + ch * 0.95 + s * 0.05, w * 0.92, Math.max(1, s * 0.12));
    const ty = bodyTop + ch + s * 0.85;
    if (sh.tl === 'bar') { taillight(cx, ty, w * 0.86, s * 0.45, true, k); }
    else if (sh.tl === 'tri') { for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) taillight(cx + sd * (w * 0.42 - i * s * 0.55), ty, s * 0.42, s * 0.55, true, k); }
    else if (sh.tl === 'round') { for (const sd of [-1, 1]) { taillight(cx + sd * w * 0.36, ty, s * 0.7, s * 0.7, true, k); taillight(cx + sd * w * 0.24, ty, s * 0.6, s * 0.6, true, k); } }
    else { for (const sd of [-1, 1]) taillight(cx + sd * w * 0.34, ty, w * 0.24, s * 0.5, true, k); }
    ctx.fillStyle = shade('#e6e2d6', k); ctx.fillRect(cx - s * 0.6, ty + s * 0.45, s * 1.2, s * 0.5);
    ctx.fillStyle = shade('#9a9a9e', k); ctx.beginPath(); ctx.ellipse(cx - w * 0.3, cy - s * 0.85, s * 0.28, s * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx + w * 0.3, cy - s * 0.85, s * 0.28, s * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    if (sh.wing) {
      const wy = cy - s * sh.wingH, ww = w * (pro ? 1.08 : 0.9);
      if (pro) { const deck = bodyTop + s * sh.cabH * 0.95; ctx.fillStyle = shade('#222', k); ctx.fillRect(cx - ww * 0.35, wy, s * 0.25, deck - wy); ctx.fillRect(cx + ww * 0.35 - s * 0.25, wy, s * 0.25, deck - wy); }
      rrect(cx - ww / 2, wy - s * 0.35, ww, s * 0.4, s * 0.1, shade(pro ? accent : col, k * 0.9));
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(cx - ww / 2, wy - s * 0.35, ww, Math.max(1, s * 0.1));
    }
    if (pro) {
      ctx.fillStyle = shade(col, k * 0.8); ctx.fillRect(cx - s * 0.9, bodyTop - s * 0.45, s * 1.8, s * 0.5);
      ctx.strokeStyle = shade('#333', k); ctx.lineWidth = Math.max(1, s * 0.12); for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sd * s * 1.2, cy - s * 0.6); ctx.lineTo(cx + sd * s * 1.5, cy + s * 0.2); ctx.stroke(); }
      rrect(cx - s * 0.8, cy - s * 2.2, s * 1.6, s * 0.9, s * 0.2, shade('#b81e1e', k));
    }
  }
  function drawFunnyRear(cx, cy, s, o, k, sideK) {
    const col = o.color, w = s * 7, h = s * 3.9, top = cy - h;
    if (sideK > 0.05) { const len = s * 16 * sideK; poly([[cx + w / 2, cy - s * 0.7], [cx + w / 2 - s * 0.3, top + s * 0.4], [cx + w / 2 + len * 0.7, top + s * 1.2 - len * 0.04], [cx + w / 2 + len, cy - s * 0.9 - len * 0.06]], shade(col, k * 0.72)); }
    tire(cx - w / 2 + s * 0.9, cy, s * 1.6, s * 2.9, s, k); tire(cx + w / 2 - s * 0.9, cy, s * 1.6, s * 2.9, s, k);
    const g = ctx.createLinearGradient(0, top, 0, cy); g.addColorStop(0, shade(col, k * 1.15, 25)); g.addColorStop(0.5, shade(col, k)); g.addColorStop(1, shade(col, k * 0.55));
    poly([[cx - w / 2, cy - s * 0.6], [cx - w * 0.42, top], [cx + w * 0.42, top], [cx + w / 2, cy - s * 0.6]], g);
    rrect(cx - w * 0.18, top - s * 0.6, w * 0.36, s * 0.7, s * 0.15, shade('#2a2a2e', k));
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(cx - w * 0.4, top + s * 0.08, w * 0.8, Math.max(1, s * 0.12));
    rrect(cx - w * 0.44, cy - s * 1.2, w * 0.88, s * 0.7, s * 0.15, shade('#1b1b1e', k));
    ctx.fillStyle = shade('#333', k); ctx.fillRect(cx - w * 0.3, cy - s * 5.0, s * 0.25, s * 1.3); ctx.fillRect(cx + w * 0.3 - s * 0.25, cy - s * 5.0, s * 0.25, s * 1.3);
    rrect(cx - w * 0.56, cy - s * 5.4, w * 1.12, s * 0.5, s * 0.1, shade(o.accent || '#ddd', k));
    for (const sd of [-1, 1]) rrect(cx + sd * s * 1.1 - s * 0.7, cy - s * 2.4, s * 1.4, s * 0.9, s * 0.2, shade('#b81e1e', k));
    ctx.strokeStyle = shade('#c9c9c9', k); ctx.lineWidth = Math.max(1, s * 0.3); for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(cx + sd * (w * 0.5 - s * 0.6), top + s * 1.4 + i * s * 0.35); ctx.lineTo(cx + sd * (w * 0.5 + s * 0.6), top + s * 0.9 + i * s * 0.35); ctx.stroke(); }
  }
  function drawDragsterRear(cx, cy, s, o, k, sideK) {
    const col = o.color;
    tire(cx - s * 3.6, cy, s * 1.7, s * 3.0, s, k); tire(cx + s * 3.6, cy, s * 1.7, s * 3.0, s, k);
    const g = ctx.createLinearGradient(0, cy - s * 2.6, 0, cy); g.addColorStop(0, shade(col, k * 1.2, 40)); g.addColorStop(1, shade(col, k * 0.6));
    rrect(cx - s * 1.1, cy - s * 2.6, s * 2.2, s * 2.6, s * 0.5, g);
    rrect(cx - s * 0.75, cy - s * 3.0, s * 1.5, s * 0.6, s * 0.2, shade('#2a2a2e', k));
    ctx.strokeStyle = shade('#d0d0d0', k); ctx.lineWidth = Math.max(1, s * 0.32);
    for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(cx + sd * s * 1.2, cy - s * 1.3 + i * s * 0.3); ctx.lineTo(cx + sd * s * 2.4, cy - s * 2.6 + i * s * 0.3); ctx.stroke(); }
    ctx.fillStyle = shade('#333', k); ctx.fillRect(cx - s * 0.35, cy - s * 7.4, s * 0.25, s * 4.2); ctx.fillRect(cx + s * 0.1, cy - s * 7.4, s * 0.25, s * 4.2);
    ctx.fillRect(cx - s * 2.0, cy - s * 7.3, s * 4, s * 0.3);
    rrect(cx - s * 4.6, cy - s * 8.3, s * 9.2, s * 1.1, s * 0.2, shade(o.accent || '#eee', k));
    ctx.fillStyle = shade('#333', k); for (const sd of [-1, 1]) ctx.fillRect(cx + sd * s * 4.5 - s * 0.15, cy - s * 8.6, s * 0.3, s * 1.7);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(cx - s * 4.5, cy - s * 8.3, s * 9, Math.max(1, s * 0.15));
    for (const sd of [-1, 1]) rrect(cx + sd * s * 0.9 - s * 0.55, cy - s * 4.0, s * 1.1, s * 0.8, s * 0.2, shade('#b81e1e', k));
    ctx.fillStyle = '#ff3b30'; ctx.fillRect(cx - s * 0.5, cy - s * 3.4, s, s * 0.25);
  }

  /* ---------- cockpit ---------- */
  function drawCockpit(S, dashTop) {
    const view = S.viewStyle || 'car', col = S.color || '#333', k = night ? 0.55 : 1;
    const pitch = S.pitch || 0;
    const hoodY = dashTop - H * 0.105 - pitch * H * 0.05;
    if (view === 'dragster') return drawDragsterCockpit(S, dashTop, k);
    const hoodPhoto = S.spec && S.spec.id ? asset('hood', S.spec.id) : null;
    if (hoodPhoto) { // photographed hood: stretched across the bottom of the view, above the dash
      const ih = H - (hoodY - H * 0.05); ctx.drawImage(hoodPhoto, -W * 0.05, hoodY - H * 0.05, W * 1.1, ih);
      if (night) { ctx.globalAlpha = 0.4; ctx.fillStyle = '#000'; ctx.fillRect(0, hoodY - H * 0.05, W, ih); ctx.globalAlpha = 1; }
    } else {
    const gH = ctx.createLinearGradient(0, hoodY - H * 0.04, 0, dashTop);
    gH.addColorStop(0, shade(col, k * 1.25, 40)); gH.addColorStop(0.25, shade(col, k * 1.05, 10)); gH.addColorStop(0.7, shade(col, k * 0.8)); gH.addColorStop(1, shade(col, k * 0.55));
    ctx.fillStyle = gH; ctx.beginPath(); ctx.moveTo(-W * 0.1, H); ctx.lineTo(-W * 0.1, hoodY + H * 0.06); ctx.quadraticCurveTo(W / 2, hoodY - H * 0.045, W * 1.1, hoodY + H * 0.06); ctx.lineTo(W * 1.1, H); ctx.closePath(); ctx.fill();
    const gR = ctx.createLinearGradient(0, hoodY - H * 0.02, 0, hoodY + H * 0.06); gR.addColorStop(0, night ? 'rgba(120,130,160,.18)' : 'rgba(255,255,255,.32)'); gR.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gR; ctx.beginPath(); ctx.moveTo(-W * 0.1, hoodY + H * 0.06); ctx.quadraticCurveTo(W / 2, hoodY - H * 0.045, W * 1.1, hoodY + H * 0.06); ctx.lineTo(W * 1.1, hoodY + H * 0.08); ctx.quadraticCurveTo(W / 2, hoodY + H * 0.02, -W * 0.1, hoodY + H * 0.08); ctx.closePath(); ctx.fill();
    const gD = ctx.createLinearGradient(W * 0.35, 0, W * 0.65, 0); gD.addColorStop(0, 'rgba(0,0,0,0)'); gD.addColorStop(0.2, 'rgba(255,255,255,.10)'); gD.addColorStop(0.5, 'rgba(255,255,255,.18)'); gD.addColorStop(0.8, 'rgba(0,0,0,.12)'); gD.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gD; ctx.beginPath(); ctx.moveTo(W * 0.35, dashTop); ctx.lineTo(W * 0.4, hoodY - H * 0.01); ctx.lineTo(W * 0.6, hoodY - H * 0.01); ctx.lineTo(W * 0.65, dashTop); ctx.closePath(); ctx.fill();
    if (view === 'scoop') {
      const gS = ctx.createLinearGradient(0, hoodY - H * 0.09, 0, hoodY + H * 0.02); gS.addColorStop(0, '#3a3a3e'); gS.addColorStop(1, '#141416');
      poly([[W * 0.33, hoodY + H * 0.03], [W * 0.67, hoodY + H * 0.03], [W * 0.62, hoodY - H * 0.085], [W * 0.38, hoodY - H * 0.085]], gS);
      ctx.save(); ctx.beginPath(); ctx.moveTo(W * 0.33, hoodY + H * 0.03); ctx.lineTo(W * 0.67, hoodY + H * 0.03); ctx.lineTo(W * 0.62, hoodY - H * 0.085); ctx.lineTo(W * 0.38, hoodY - H * 0.085); ctx.closePath(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1; for (let i = -40; i < 40; i++) { ctx.beginPath(); ctx.moveTo(W * 0.5 + i * 5, hoodY - H * 0.1); ctx.lineTo(W * 0.5 + i * 5 + H * 0.12, hoodY + H * 0.03); ctx.stroke(); } ctx.restore();
      ctx.fillStyle = '#050506'; ctx.fillRect(W * 0.395, hoodY - H * 0.083, W * 0.21, H * 0.022);
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(W * 0.38, hoodY - H * 0.06, W * 0.24, 2);
    }
    if (view === 'funny') {
      const gB = ctx.createLinearGradient(W * 0.4, 0, W * 0.6, 0); gB.addColorStop(0, '#5a5a60'); gB.addColorStop(0.5, '#b5b5bc'); gB.addColorStop(1, '#4a4a50');
      rrect(W * 0.41, hoodY - H * 0.10, W * 0.18, H * 0.12, 6, gB);
      rrect(W * 0.43, hoodY - H * 0.15, W * 0.14, H * 0.055, 4, '#2c2c30'); ctx.fillStyle = '#0b0b0c'; ctx.fillRect(W * 0.45, hoodY - H * 0.145, W * 0.10, H * 0.018);
      ctx.strokeStyle = shade('#a8a8ad', k); ctx.lineWidth = W * 0.014; ctx.beginPath(); ctx.moveTo(W * 0.05, H); ctx.lineTo(W * 0.15, hoodY - H * 0.28); ctx.lineTo(W * 0.85, hoodY - H * 0.28); ctx.lineTo(W * 0.95, H); ctx.stroke();
    }
    }
    // A-pillars: angled bars with a rubber seal and a soft highlight
    const pw = W * 0.055, pb = dashTop + H * 0.02;
    for (const sd of [1, -1]) {
      const x0 = sd === 1 ? 0 : W;
      const gP = ctx.createLinearGradient(x0, 0, x0 + sd * pw * 1.6, 0); gP.addColorStop(0, night ? '#0a0b0e' : '#141518'); gP.addColorStop(0.7, night ? '#15171b' : '#25272c'); gP.addColorStop(1, night ? '#0a0b0e' : '#141518');
      poly([[x0 + sd * W * 0.06, -2], [x0 + sd * (W * 0.06 + pw), -2], [x0 + sd * pw * 0.35, pb], [x0 - sd * W * 0.02, pb]], gP);
      poly([[x0 + sd * (W * 0.06 + pw), -2], [x0 + sd * (W * 0.06 + pw + 3), -2], [x0 + sd * (pw * 0.35 + 3), pb], [x0 + sd * pw * 0.35, pb]], 'rgba(0,0,0,.5)');
    }
    const gT = ctx.createLinearGradient(0, 0, 0, H * 0.035); gT.addColorStop(0, 'rgba(0,0,0,.55)'); gT.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gT; ctx.fillRect(0, 0, W, H * 0.035);
    drawMirror(S);
    const gDash = ctx.createLinearGradient(0, dashTop - H * 0.03, 0, H); gDash.addColorStop(0, '#26272c'); gDash.addColorStop(0.08, '#121316'); gDash.addColorStop(1, '#0a0a0c');
    ctx.fillStyle = gDash; ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, dashTop + H * 0.03); ctx.quadraticCurveTo(W / 2, dashTop - H * 0.03, W, dashTop + H * 0.03); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#33353b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, dashTop + H * 0.03); ctx.quadraticCurveTo(W / 2, dashTop - H * 0.03, W, dashTop + H * 0.03); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 9; i++) ctx.fillRect(W * 0.2 + i * W * 0.07, dashTop + H * 0.012, W * 0.04, 3);
  }
  function drawMirror(S) {
    const mw = Math.min(W * 0.3, 130), mh = mw * 0.32, mx = W / 2 - mw / 2, my = (S.safeTop || 0) + 62;
    rrect(mx - 3, my - 3, mw + 6, mh + 6, 5, '#101114');
    const g = ctx.createLinearGradient(0, my, 0, my + mh); g.addColorStop(0, night ? '#0b0d16' : '#8fb5dd'); g.addColorStop(0.55, night ? '#1b1a16' : '#d9d3c3'); g.addColorStop(0.56, night ? '#141418' : '#4a4b4f'); g.addColorStop(1, night ? '#1c1d22' : '#3a3b3f');
    rrect(mx, my, mw, mh, 3, g);
    const o = S.opp;
    if (o) {
      const rel = o.x - S.camX - 8; // rival relative to the camera (ft); only a car behind shows in the mirror
      if (rel < -2) {
        const dist = clamp(-rel, 8, 250); const sc = mh * 1.2 / (dist / 10);
        const px = mx + mw * (S.lane === 1 ? 0.30 : 0.70), py = my + mh * 0.74;
        ctx.save(); ctx.beginPath(); ctx.rect(mx, my, mw, mh); ctx.clip();
        rrect(px - sc * 0.9, py - sc * 0.55, sc * 1.8, sc * 0.55, sc * 0.1, shade(o.color, night ? 0.6 : 1));
        rrect(px - sc * 0.55, py - sc * 0.9, sc * 1.1, sc * 0.4, sc * 0.1, '#20262e');
        ctx.fillStyle = '#0d0d0f'; ctx.fillRect(px - sc * 0.95, py - sc * 0.25, sc * 0.3, sc * 0.3); ctx.fillRect(px + sc * 0.65, py - sc * 0.25, sc * 0.3, sc * 0.3);
        ctx.restore();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(mx, my, mw, 2);
  }
  function drawDragsterCockpit(S, dashTop, k) {
    const d = 12, s = cam.f / d;
    const [ax, ay] = proj(d, 0, 0);
    for (const side of [-1, 1]) {
      const g = ctx.createLinearGradient(0, H, 0, ay); g.addColorStop(0, shade('#c9c9ce', k)); g.addColorStop(0.5, shade('#8e8e94', k)); g.addColorStop(1, shade('#5a5a60', k));
      const bx0 = W / 2 + side * W * 0.27, bx1 = W / 2 + side * W * 0.215; // bottom width tapering to the front axle
      poly([[bx0, H], [bx1, H], [ax + side * s * 0.95, ay - s * 0.5], [ax + side * s * 1.05, ay - s * 0.6]], g);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; poly([[bx0 - side * 3, H], [bx0 - side * 7, H], [ax + side * s * 1.0, ay - s * 0.62], [ax + side * s * 1.02, ay - s * 0.6]], 'rgba(255,255,255,.35)');
      const g2 = ctx.createLinearGradient(0, H, 0, ay); g2.addColorStop(0, shade('#a0a0a6', k)); g2.addColorStop(1, shade('#55555b', k));
      poly([[W / 2 + side * W * 0.18, H], [W / 2 + side * W * 0.155, H], [ax + side * s * 0.7, ay - s * 1.25], [ax + side * s * 0.78, ay - s * 1.3]], g2);
      for (let i = 1; i < 6; i++) { const t = i / 6; const xa = lerp(bx0, ax + side * s, t), xb = lerp(W / 2 + side * W * 0.165, ax + side * s * 0.74, t), ya = lerp(H, ay - s * 0.55, t), yb = lerp(H, ay - s * 1.27, t); ctx.strokeStyle = shade('#77777d', k); ctx.lineWidth = Math.max(1, 3 * (1 - t)); ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke(); }
    }
    for (const side of [-1, 1]) { rrect(ax + side * s * 1.45 - s * 0.2, ay - s * 2.2, s * 0.4, s * 2.2, s * 0.15, '#0d0d0f'); ctx.fillStyle = shade('#3a3a40', k); ctx.fillRect(ax + side * s * 1.45 - s * 0.08, ay - s * 1.6, s * 0.16, s * 1.0); }
    const gW = ctx.createLinearGradient(0, ay - s * 3.2, 0, ay - s * 2.6); gW.addColorStop(0, shade(S.accent || '#ffb000', k * 1.2, 30)); gW.addColorStop(1, shade(S.accent || '#ffb000', k * 0.7));
    rrect(ax - s * 2.7, ay - s * 3.2, s * 5.4, s * 0.6, s * 0.1, gW);
    ctx.fillStyle = shade('#2a2a2e', k); for (const side of [-1, 1]) ctx.fillRect(ax + side * s * 2.6 - s * 0.1, ay - s * 3.5, s * 0.2, s * 1.2);
    ctx.fillStyle = shade(S.color || '#111', k * 1.1, 10); ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, dashTop + H * 0.1); ctx.quadraticCurveTo(W / 2, dashTop - H * 0.03, W, dashTop + H * 0.1); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.moveTo(0, dashTop + H * 0.1); ctx.quadraticCurveTo(W / 2, dashTop - H * 0.03, W, dashTop + H * 0.1); ctx.lineTo(W, dashTop + H * 0.12); ctx.quadraticCurveTo(W / 2, dashTop + H * 0.02, 0, dashTop + H * 0.12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2b2b2f'; ctx.lineWidth = W * 0.022; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(W * 0.30, dashTop + H * 0.10); ctx.lineTo(W * 0.42, dashTop + H * 0.065); ctx.lineTo(W * 0.58, dashTop + H * 0.065); ctx.lineTo(W * 0.70, dashTop + H * 0.10); ctx.stroke();
    ctx.strokeStyle = shade('#9a9aa0', k); ctx.lineWidth = W * 0.012; ctx.beginPath(); ctx.moveTo(W * 0.02, H * 0.3); ctx.lineTo(W * 0.12, H * 0.02); ctx.moveTo(W * 0.98, H * 0.3); ctx.lineTo(W * 0.88, H * 0.02); ctx.stroke();
  }

  /* ---------- HUD ---------- */
  const DISPLAY = '"Avenir Next Condensed","Arial Narrow","Roboto Condensed",sans-serif';
  const MONO = '"SF Mono",Menlo,Consolas,monospace';
  function txt(str, x, y, size, col, align, font, weight) {
    ctx.font = `${weight || 600} ${size}px ${font || DISPLAY}`; ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(str, x, y);
  }
  function drawHUD(S, dashTop, night) {
    const h = S.hud, sat = S.safeTop || 0, sab = S.safeBottom || 0;
    const btn = Math.min(W * 0.30, 150);
    const rad = Math.max(40, Math.min((W - 2 * btn - 48) / 2, portrait ? 0.125 * H : 0.17 * H));
    const cx = W / 2, cy = H - sab - 14 - btn / 2;
    const spec = S.spec, red = spec.redline, top = Math.ceil(red / 1000) * 1000;
    const a0 = Math.PI * 0.78, a1 = Math.PI * 2.22;
    const ang = (rpm) => a0 + (a1 - a0) * clamp(rpm / top, 0, 1);
    const gB = ctx.createRadialGradient(cx, cy, rad * 0.9, cx, cy, rad * 1.14); gB.addColorStop(0, '#0a0a0c'); gB.addColorStop(0.7, '#2a2b30'); gB.addColorStop(1, '#0c0c0e');
    ctx.beginPath(); ctx.arc(cx, cy, rad * 1.14, 0, Math.PI * 2); ctx.fillStyle = gB; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, rad * 1.0, 0, Math.PI * 2); ctx.fillStyle = '#0d0e11'; ctx.fill();
    ctx.lineWidth = rad * 0.16; ctx.lineCap = 'butt';
    ctx.strokeStyle = '#25282e'; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.86, a0, a1); ctx.stroke();
    if (h.opt) {
      const perf = red * 0.016, good = red * 0.045;
      ctx.strokeStyle = '#6b5a12'; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.86, ang(h.opt - good), ang(Math.min(red, h.opt + good))); ctx.stroke();
      ctx.strokeStyle = '#1f9b45'; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.86, ang(h.opt - perf), ang(Math.min(red, h.opt + perf))); ctx.stroke();
    }
    ctx.strokeStyle = '#7a1620'; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.86, ang(red), a1); ctx.stroke();
    const stepK = top > 12000 ? 2000 : 1000;
    for (let r = 0; r <= top; r += stepK) {
      const a = ang(r); const c = Math.cos(a), sn = Math.sin(a);
      ctx.strokeStyle = '#cfcac0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + c * rad * 0.72, cy + sn * rad * 0.72); ctx.lineTo(cx + c * rad * 0.78, cy + sn * rad * 0.78); ctx.stroke();
      txt(String(r / 1000), cx + c * rad * 0.56, cy + sn * rad * 0.56, rad * 0.17, r >= red ? '#ff5b6a' : '#d9d3c4', 'center');
    }
    const na = ang(h.rpm), flick = h.limiter ? (Math.random() - 0.5) * 0.06 : 0;
    ctx.strokeStyle = h.limiter ? '#ff2a3d' : '#ffb000'; ctx.lineWidth = Math.max(3, rad * 0.05); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(na + flick) * rad * 0.12, cy - Math.sin(na + flick) * rad * 0.12); ctx.lineTo(cx + Math.cos(na + flick) * rad * 0.80, cy + Math.sin(na + flick) * rad * 0.80); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.1, 0, Math.PI * 2); ctx.fill();
    txt(String(Math.round(h.rpm / 10) * 10), cx, cy + rad * 0.5, rad * 0.26, '#f1ebdc', 'center', MONO, 600);
    txt('RPM', cx, cy + rad * 0.78, rad * 0.15, '#8d8880', 'center');
    // readouts: a row above the tach in portrait, flanking it in landscape
    const btnTop = H - sab - 14 - btn; // top edge of the thumb buttons — the readouts must clear it
    const ry = portrait ? Math.min(cy - rad * 1.1 - Math.max(30, H * 0.045), btnTop - rad * 0.9) : cy;
    const gx = portrait ? W * 0.22 : cx - rad * 2.0, sx = portrait ? W / 2 : cx + rad * 2.0;
    const lx = portrait ? W * 0.78 : cx, ly = portrait ? ry + rad * 0.05 : cy - rad * 1.5;
    txt('GEAR', gx, ry - rad * 0.42, rad * 0.2, '#8d8880', 'center');
    txt(h.gearLabel, gx, ry + rad * 0.12, rad * 0.95, h.shifting ? '#8d8880' : '#f1ebdc', 'center', DISPLAY, 700);
    if (S.autoShift) txt('AUTO', gx, ry + rad * 0.68, rad * 0.18, '#ffb000', 'center');
    txt('MPH', sx, ry - rad * 0.42, rad * 0.2, '#8d8880', 'center');
    txt(String(Math.round(h.mph)), sx, ry + rad * 0.12, rad * 0.95, '#f1ebdc', 'center', MONO, 600);
    if (h.status) txt(h.status.text, sx, ry + rad * 0.68, rad * 0.18, h.status.col, 'center');
    const sl = h.opt && h.rpm >= h.opt - red * 0.035 && !S.autoShift;
    if (sl) glow(lx, ly, rad * 0.9, '#ffb000', 0.5);
    ctx.beginPath(); ctx.arc(lx, ly, rad * 0.3, 0, Math.PI * 2); ctx.fillStyle = sl ? '#ffb000' : '#2a2000'; ctx.fill();
    txt('SHIFT', lx, ly - rad * 0.47, rad * 0.2, '#8d8880', 'center');
    const ty = sat + 22;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, sat, W, 58);
    txt('R/T', W * 0.5 - 4, ty - 8, 12, '#8d8880', 'right');
    txt(h.rt, W * 0.5 - 4, ty + 12, 22, h.rtCol || '#f1ebdc', 'right', MONO, 600);
    txt('E/T', W * 0.5 + 8, ty - 8, 12, '#8d8880', 'left');
    txt(h.et, W * 0.5 + 8, ty + 12, 22, '#f1ebdc', 'left', MONO, 600);
    drawMiniTree(S, 14 + (S.safeLeft || 0), sat + 66);
    drawPosBar(S, W - 14 - (S.safeRight || 0), sat + 132);
    if (h.msg && h.msg.t > 0) {
      ctx.globalAlpha = clamp(h.msg.t / 0.4, 0, 1);
      const my = H * 0.335; const mw = Math.min(W * 0.9, h.msg.text.length * 15 + 40);
      rrect(W / 2 - mw / 2, my - 22, mw, 44, 6, 'rgba(0,0,0,.55)');
      txt(h.msg.text, W / 2, my, 26, h.msg.col || '#f1ebdc', 'center', DISPLAY, 700);
      ctx.globalAlpha = 1;
    }
    if (h.sub && h.sub.t > 0) { ctx.globalAlpha = clamp(h.sub.t / 0.3, 0, 1); txt(h.sub.text, W / 2, H * 0.335 + 34, 15, h.sub.col || '#d9d3c4', 'center'); ctx.globalAlpha = 1; }
    if (h.heatBar !== undefined) {
      const bw = Math.min(260, W * 0.6), bx = W / 2 - bw / 2, by = H * 0.36;
      rrect(bx - 8, by - 26, bw + 16, 48, 6, 'rgba(0,0,0,.55)');
      txt('TIRE TEMP', bx, by - 14, 12, '#8d8880');
      ctx.fillStyle = '#2a2d33'; ctx.fillRect(bx, by, bw, 10);
      ctx.fillStyle = '#1f9b45'; ctx.fillRect(bx + bw * 0.62, by, bw * 0.24, 10);
      const f = clamp(h.heatBar / 1.55, 0, 1);
      ctx.fillStyle = h.heatBar > 1.18 ? '#ff2a3d' : h.heatBar >= 0.95 ? '#2be35a' : '#ffb000'; ctx.fillRect(bx, by + 2, bw * f, 6);
    }
  }
  function drawMiniTree(S, x, y) {
    const r = 9, gap = 20;
    rrect(x - 4, y - 8, 84, gap * 7.4 + 12, 6, 'rgba(0,0,0,.5)');
    const me = S.lane === -1 ? S.tree.left : S.tree.right, opp = S.lane === -1 ? S.tree.right : S.tree.left;
    treeColumn(x + 20, y, r, gap, S.lane === -1 ? me : opp);
    treeColumn(x + 58, y, r, gap, S.lane === -1 ? opp : me);
    txt(S.lane === -1 ? 'YOU' : 'RIVAL', x + 20, y + gap * 7.6 - 2, 10, S.lane === -1 ? '#ffb000' : '#8d8880', 'center');
    txt(S.lane === -1 ? 'RIVAL' : 'YOU', x + 58, y + gap * 7.6 - 2, 10, S.lane === -1 ? '#8d8880' : '#ffb000', 'center');
  }
  function drawPosBar(S, xr, y) {
    const w = Math.min(150, W * 0.36), x = xr - w;
    rrect(x - 8, y - 22, w + 16, 44, 6, 'rgba(0,0,0,.5)');
    ctx.fillStyle = '#2a2d33'; ctx.fillRect(x, y - 1, w, 2);
    ctx.fillStyle = '#e9e4d3'; ctx.fillRect(x + w - 2, y - 8, 2, 16);
    const f = (v) => x + w * clamp(v / S.dist, 0, 1);
    if (S.opp) { ctx.fillStyle = '#8d8880'; ctx.beginPath(); ctx.arc(f(S.opp.progress), y - 6, 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.arc(f(S.player.progress), y + 6, 5, 0, Math.PI * 2); ctx.fill();
    txt('STRIPE', x + w, y + 16, 9, '#8d8880', 'right');
  }
  function clear() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); if (gl3d) ctx.clearRect(0, 0, W, H); else { ctx.fillStyle = '#0B0C0E'; ctx.fillRect(0, 0, W, H); } }
  return { attach, resize, drawScene, clear, stepParticles, spawnSmoke, particles, treeColumn, get W() { return W; }, get H() { return H; }, get portrait() { return portrait; }, get gl3d() { return gl3d; } };
})();
