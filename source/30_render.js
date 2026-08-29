/* ===================== renderer ===================== */
const R = (function () {
  const FT = PH.FT_M;
  let cv, ctx, W = 390, H = 844, dpr = 1, portrait = true;
  const cam = { f: 400, h: 3.6, horizon: 330, cx: 195 };
  const particles = [];
  let streakSeed = [];
  for (let i = 0; i < 40; i++) streakSeed.push({ a: Math.random() * Math.PI * 2, r: 0.3 + Math.random() * 0.7, l: 0.4 + Math.random() * 0.6 });

  function attach(canvas) { cv = canvas; ctx = cv.getContext('2d', { alpha: false }); resize(); }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    portrait = H >= W;
  }
  function proj(d, x, z) { return [cam.cx + cam.f * x / d, cam.horizon + cam.f * (cam.h - z) / d]; }
  const clamp = PH.clamp, lerp = PH.lerp;
  function shade(hex, k) { // multiply a hex colour
    const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = clamp(Math.round(r * k), 0, 255); g = clamp(Math.round(g * k), 0, 255); b = clamp(Math.round(b * k), 0, 255);
    return `rgb(${r},${g},${b})`;
  }
  function quad(p1, p2, p3, p4, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath(); ctx.fill(); }

  /* ---------- particles ---------- */
  function spawnSmoke(sx, sy, n, size, vx, vy, dark) {
    for (let i = 0; i < n; i++) particles.push({ x: sx + (Math.random() - 0.5) * size, y: sy + (Math.random() - 0.5) * size * 0.4, vx: vx + (Math.random() - 0.5) * 40, vy: vy - Math.random() * 30, r: size * (0.4 + Math.random() * 0.6), a: 0.55, life: 1.2 + Math.random() * 0.8, dark: !!dark });
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
      ctx.globalAlpha = Math.min(0.6, p.a);
      ctx.fillStyle = p.dark ? (night ? '#2a2a2e' : '#5a5a60') : (night ? '#8d8d95' : '#e8e8ec');
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- scene ---------- */
  function drawScene(S) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const night = S.night;
    const view = S.viewStyle || 'car';
    const dashTop = portrait ? H * 0.64 : H * 0.66; // where the cockpit starts
    cam.f = W * (portrait ? 1.05 : 0.8);
    cam.h = view === 'dragster' ? 2.3 : view === 'funny' ? 3.0 : 3.5;
    const baseHorizon = (portrait ? 0.40 : 0.42) * H;
    const pitch = S.pitch || 0;
    const shk = S.shake || 0;
    const shx = (Math.random() - 0.5) * 2 * shk * 7, shy = (Math.random() - 0.5) * 2 * shk * 5;
    cam.horizon = baseHorizon + pitch * H * 0.06 + shy;
    cam.cx = W / 2 + shx;
    const camX = S.camX; // world ft
    const laneX = S.lane * 7.5; // camera lateral position
    // ---- sky ----
    let g = ctx.createLinearGradient(0, 0, 0, cam.horizon);
    if (night) { g.addColorStop(0, '#05060a'); g.addColorStop(0.7, '#0b0d16'); g.addColorStop(1, '#2a1f14'); }
    else { g.addColorStop(0, '#4f8ed6'); g.addColorStop(0.75, '#a9c9ea'); g.addColorStop(1, '#e6e1d3'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, cam.horizon + 2);
    // ground beyond track (grass / dirt)
    ctx.fillStyle = night ? '#101210' : '#6c7a3a'; ctx.fillRect(0, cam.horizon, W, H - cam.horizon);
    const maxD = 2400;
    const L = (x, z, d) => proj(d, x - laneX, z || 0);
    // ---- distant scenery: tree line ----
    {
      const [x0, y0] = L(-400, 18, maxD), [x1, y1] = L(400, 18, maxD);
      ctx.fillStyle = night ? '#0a0c0f' : '#3e5a2e'; ctx.fillRect(0, y0, W, cam.horizon - y0 + 1);
    }
    // ---- asphalt & launch pad ----
    const dNear = Math.max(1.5, cam.f * cam.h / (H - cam.horizon));
    const trk = (xa, xb, from, to, fill) => { // track patch between world x from..to (ft ahead)
      const d0 = Math.max(dNear, from - camX), d1 = Math.min(maxD, to - camX);
      if (d1 <= d0) return;
      quad(L(xa, 0, d1), L(xb, 0, d1), L(xb, 0, d0), L(xa, 0, d0), fill);
    };
    trk(-16, 16, camX - 100, camX + maxD, night ? '#15161a' : '#3a3a3e');           // asphalt
    trk(-16, 16, -80, 330, night ? '#25262a' : '#8c8a84');                            // concrete launch pad
    // rubber groove in each lane
    for (const ln of [-1, 1]) {
      trk(ln * 7.5 - 4.2, ln * 7.5 - 1.8, -30, 1500, night ? '#0f1012' : '#232326');
      trk(ln * 7.5 + 1.8, ln * 7.5 + 4.2, -30, 1500, night ? '#0f1012' : '#232326');
    }
    // centre line & edge lines
    trk(-0.3, 0.3, -100, camX + maxD, night ? '#4d4a3c' : '#d7d2be');
    trk(-15.4, -15, -100, camX + maxD, night ? '#3b3a34' : '#c9c4b3');
    trk(15, 15.4, -100, camX + maxD, night ? '#3b3a34' : '#c9c4b3');
    // start line, finish line, beam markers
    trk(-15, 15, -0.6, 0.6, '#e9e4d3');
    const finish = S.dist;
    trk(-15, 15, finish - 0.8, finish + 0.8, '#ffffff');
    for (let i = 0; i < 8; i++) trk(-15 + i * 3.75, -15 + i * 3.75 + 1.9, finish + 1.5, finish + 6, i % 2 ? '#ffffff' : '#111');
    for (let i = 0; i < 8; i++) trk(-15 + i * 3.75 + 1.9, -15 + i * 3.75 + 3.75, finish + 6, finish + 10.5, i % 2 ? '#ffffff' : '#111');
    // pool of light from poles at night
    if (night) {
      for (let px = 0; px <= 1800; px += 120) {
        const d = px - camX; if (d < dNear || d > 900) continue;
        ctx.globalAlpha = 0.10 * (1 - d / 900);
        const [cx, cy] = L(0, 0, d); const s = cam.f / d;
        ctx.fillStyle = '#fff2c8'; ctx.beginPath(); ctx.ellipse(cx, cy, s * 40, s * 5, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // ---- walls ----
    const wallCol = night ? '#3a3a3c' : '#c8c3b6', wallTop = night ? '#55554f' : '#e6e2d6', wallDark = night ? '#262628' : '#9d998e';
    for (const side of [-1, 1]) {
      const xw = side * 16, d0 = dNear, d1 = maxD;
      const inner = side * 16, outer = side * 17;
      quad(L(inner, 0, d1), L(inner, 3, d1), L(inner, 3, d0), L(inner, 0, d0), side === S.lane ? wallDark : wallCol); // face
      quad(L(inner, 3, d1), L(outer, 3, d1), L(outer, 3, d0), L(inner, 3, d0), wallTop); // top
      // expansion joints (speed cue)
      ctx.strokeStyle = night ? '#1c1c1e' : '#8a877c'; ctx.lineWidth = 1;
      const start = Math.floor(camX / 25) * 25;
      for (let wx = start; wx < camX + 500; wx += 25) {
        const d = wx - camX; if (d < dNear) continue;
        const [x1, y1] = L(inner, 0, d), [x2, y2] = L(inner, 3, d);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }
    // ---- grandstand (left side) & light poles ----
    for (let gx = 80; gx < 1300; gx += 100) {
      const d0 = gx - camX, d1 = gx + 96 - camX; if (d1 < dNear) continue;
      const dd0 = Math.max(dNear, d0), dd1 = Math.min(maxD, d1);
      const base = night ? 0.35 : 1;
      quad(L(-24, 0, dd1), L(-24, 9, dd1), L(-24, 9, dd0), L(-24, 0, dd0), shade('#8d8a83', base));
      quad(L(-24, 9, dd1), L(-70, 26, dd1), L(-70, 26, dd0), L(-24, 9, dd0), shade('#6d6a63', base));
      // crowd rows
      ctx.strokeStyle = night ? '#3a3830' : '#c9a86d'; ctx.lineWidth = 1.2;
      for (let r = 0; r < 5; r++) { const xr = -30 - r * 8, zr = 11 + r * 3; const [x1, y1] = L(xr, zr, dd0), [x2, y2] = L(xr, zr, dd1); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
      quad(L(-70, 26, dd1), L(-70, 30, dd1), L(-70, 30, dd0), L(-70, 26, dd0), shade('#4d4a45', base));
    }
    for (let px = 0; px <= 1800; px += 120) {
      const d = px - camX; if (d < dNear || d > maxD) continue;
      for (const side of [-1, 1]) {
        const xw = side * 21;
        const [x1, y1] = L(xw, 0, d), [x2, y2] = L(xw, 40, d);
        ctx.strokeStyle = night ? '#2a2b2e' : '#55575c'; ctx.lineWidth = Math.max(1, cam.f * 0.4 / d);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        const s = cam.f / d;
        ctx.fillStyle = night ? '#fff5d6' : '#d9dce0';
        ctx.fillRect(x2 - s * 2.5 * side - (side < 0 ? s * 0 : s * 0), y2 - s * 0.8, s * 2.5, s * 1.2);
        if (night) { ctx.globalAlpha = 0.25; ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(x2 - s * 1.2 * side, y2, s * 4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      }
    }
    // ---- beam markers: cones + boards on the walls ----
    const marks = [60, 330, 660, 1000, 1320].filter(b => b <= S.dist);
    for (const b of marks) {
      const d = b - camX; if (d < dNear || d > maxD) continue;
      const s = cam.f / d;
      for (const side of [-1, 1]) {
        const [cx, cy] = L(side * 14.2, 0, d);
        ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(cx, cy - s * 2.2); ctx.lineTo(cx + s * 0.8, cy); ctx.lineTo(cx - s * 0.8, cy); ctx.closePath(); ctx.fill();
        // photocell block
        ctx.fillStyle = '#f2f2f2'; ctx.fillRect(cx - s * 0.6 + side * s * 1.2, cy - s * 1.3, s * 1.2, s * 1.3);
      }
      // distance board on the left wall
      const [bx, by] = L(-16.6, 5.5, d);
      const bw = s * 9, bh = s * 3.6;
      if (bw > 3) {
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
        ctx.fillStyle = '#ffd24a'; ctx.font = `700 ${Math.max(6, bh * 0.72)}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b === 1320 ? '1320 FINISH' : b === 1000 && S.dist === 1000 ? '1000 FINISH' : String(b), bx, by + bh * 0.05);
      }
    }
    // ---- scoreboards past the finish ----
    {
      const d = finish + 90 - camX;
      if (d > dNear && d < maxD) {
        const s = cam.f / d;
        for (const side of [-1, 1]) {
          const cxw = side * 9;
          const [px1, py1] = L(cxw, 0, d), [px2, py2] = L(cxw, 20, d);
          ctx.strokeStyle = '#333'; ctx.lineWidth = Math.max(1, s * 0.8); ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke();
          const bw = s * 14, bh = s * 9;
          ctx.fillStyle = '#0d0d10'; ctx.fillRect(px2 - bw / 2, py2 - bh, bw, bh);
          ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = 1; ctx.strokeRect(px2 - bw / 2, py2 - bh, bw, bh);
          const sb = side === S.lane ? S.board.me : S.board.opp;
          if (bw > 14) {
            ctx.fillStyle = '#ffb000'; ctx.font = `700 ${bh * 0.36}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            if (night) { ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 8; }
            ctx.fillText(sb && sb.et ? sb.et : '- - -', px2, py2 - bh * 0.68);
            ctx.fillText(sb && sb.mph ? sb.mph : '- - -', px2, py2 - bh * 0.3);
            ctx.shadowBlur = 0;
          }
        }
      }
    }
    // ---- Christmas tree at 15 ft ----
    drawTree3D(S, camX, laneX, night);
    // ---- opponent ----
    if (S.opp) drawOpponent(S, camX, laneX, night);
    // ---- speed streaks ----
    if (S.speedMph > 60) {
      const k = clamp((S.speedMph - 60) / 250, 0, 0.6);
      ctx.strokeStyle = night ? `rgba(255,255,255,${k * 0.5})` : `rgba(255,255,255,${k * 0.35})`; ctx.lineWidth = 1.5;
      for (const st of streakSeed) {
        const rx = Math.cos(st.a) * W * 0.7 * st.r, ry = Math.sin(st.a) * H * 0.7 * st.r;
        const x0 = cam.cx + rx, y0 = cam.horizon + ry;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 - rx * st.l * k * 1.6, y0 - ry * st.l * k * 1.6); ctx.stroke();
      }
    }
    drawParticles(night);
    drawCockpit(S, dashTop, night);
    drawHUD(S, dashTop, night);
  }

  function bulb(x, y, r, on, col, night) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (on) { ctx.fillStyle = col; if (r > 3) { ctx.shadowColor = col; ctx.shadowBlur = r * (night ? 2.2 : 1.2); } }
    else { ctx.fillStyle = night ? '#1c1c1f' : '#3b3b40'; }
    ctx.fill(); ctx.shadowBlur = 0;
    if (!on && r > 2) { ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke(); }
  }
  const AMB = '#FFB000', GRN = '#2BE35A', RED = '#FF2A3D', PRE = '#FFD84A';
  function treeColumn(x, y, r, gap, st, night) {
    // st: {pre, stage, a1, a2, a3, green, red}
    bulb(x - r * 0.55, y, r * 0.45, st.pre, PRE, night); bulb(x + r * 0.55, y, r * 0.45, st.pre, PRE, night);
    bulb(x - r * 0.55, y + gap * 0.8, r * 0.45, st.stage, PRE, night); bulb(x + r * 0.55, y + gap * 0.8, r * 0.45, st.stage, PRE, night);
    bulb(x, y + gap * 2.0, r, st.a1, AMB, night);
    bulb(x, y + gap * 3.2, r, st.a2, AMB, night);
    bulb(x, y + gap * 4.4, r, st.a3, AMB, night);
    bulb(x, y + gap * 5.6, r, st.green, GRN, night);
    bulb(x, y + gap * 6.8, r, st.red, RED, night);
  }
  function drawTree3D(S, camX, laneX, night) {
    const d = 15 - camX; if (d < 2.5) return;
    const s = cam.f / d;
    const [px, py] = proj(d, 0 - laneX, 9.5); // top of tree, centre line
    const r = s * 0.55, gap = s * 1.05;
    // pole + housing
    const [bx, by] = proj(d, 0 - laneX, 0);
    ctx.strokeStyle = '#2a2a2d'; ctx.lineWidth = Math.max(1, s * 0.25); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(px, py + gap * 7.6); ctx.stroke();
    ctx.fillStyle = '#141416'; ctx.fillRect(px - s * 2.4, py - r * 1.2, s * 4.8, gap * 7.6 + r * 1.4);
    treeColumn(px - s * 1.15, py, r, gap, S.tree.left, night);
    treeColumn(px + s * 1.15, py, r, gap, S.tree.right, night);
  }
  function drawOpponent(S, camX, laneX, night) {
    const o = S.opp; const d = o.x - camX - 2; if (d < 2.5 || d > 2400) return;
    const s = cam.f / d, xw = -S.lane * 7.5 - laneX;
    const k = night ? 0.55 : 1;
    const view = o.view || 'car';
    const [cx, cy] = proj(d, xw, 0);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(cx, cy, s * 4, s * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    if (view === 'dragster') {
      // long rail dragster from behind: big rear wheels, thin body, huge wing
      const wheelW = s * 1.6, wheelH = s * 3;
      ctx.fillStyle = '#0c0c0c'; ctx.fillRect(cx - s * 4.2, cy - wheelH, wheelW, wheelH); ctx.fillRect(cx + s * 4.2 - wheelW, cy - wheelH, wheelW, wheelH);
      ctx.fillStyle = shade(o.color, k); ctx.fillRect(cx - s * 1.2, cy - s * 2.6, s * 2.4, s * 2.6);
      ctx.fillStyle = shade('#333', k); ctx.fillRect(cx - s * 0.3, cy - s * 6.5, s * 0.6, s * 4); ctx.fillRect(cx - s * 2, cy - s * 6.5, s * 4, s * 0.35);
      ctx.fillStyle = shade(o.accent || '#eee', k); ctx.fillRect(cx - s * 4.5, cy - s * 8.2, s * 9, s * 1.7);
      ctx.fillStyle = '#ff3b30'; ctx.fillRect(cx - s * 0.5, cy - s * 3.2, s * 1, s * 0.3);
    } else {
      const bw = s * 6.2, bh = s * 4.2, rw = s * 6.6;
      ctx.fillStyle = '#0c0c0c'; ctx.fillRect(cx - rw / 2, cy - s * 2.2, s * 1.2, s * 2.2); ctx.fillRect(cx + rw / 2 - s * 1.2, cy - s * 2.2, s * 1.2, s * 2.2);
      ctx.fillStyle = shade(o.color, k); ctx.fillRect(cx - bw / 2, cy - bh, bw, bh - s * 0.6);
      ctx.fillStyle = shade('#1e2228', k); ctx.fillRect(cx - bw * 0.42, cy - bh, bw * 0.84, s * 1.3); // rear glass
      ctx.fillStyle = shade(o.color, k * 0.85); ctx.fillRect(cx - bw / 2, cy - s * 1.6, bw, s * 1.0); // bumper
      ctx.fillStyle = '#ff3b30'; ctx.fillRect(cx - bw / 2 + s * 0.4, cy - s * 2.6, s * 1.4, s * 0.45); ctx.fillRect(cx + bw / 2 - s * 1.8, cy - s * 2.6, s * 1.4, s * 0.45);
      if (view === 'scoop' || view === 'funny') { ctx.fillStyle = shade(o.accent || '#eee', k); ctx.fillRect(cx - bw * 0.55, cy - bh - s * 0.6, bw * 1.1, s * 0.45); ctx.fillRect(cx - bw * 0.5, cy - bh - s * 0.2, s * 0.35, s * 0.6); ctx.fillRect(cx + bw * 0.5 - s * 0.35, cy - bh - s * 0.2, s * 0.35, s * 0.6); }
      if (view === 'funny') { ctx.fillStyle = shade('#222', k); ctx.fillRect(cx - s * 0.9, cy - bh - s * 1.3, s * 1.8, s * 1.3); }
    }
    if (o.spinning && d < 400) spawnSmoke(cx, cy - s * 0.5, 1, s * 3.5, 0, -10, false);
  }

  /* ---------- cockpit ---------- */
  function drawCockpit(S, dashTop, night) {
    const view = S.viewStyle || 'car', col = S.color || '#333', k = night ? 0.6 : 1;
    const pitch = S.pitch || 0;
    const shk = S.shake || 0;
    const hoodY = dashTop - H * 0.10 - pitch * H * 0.05;
    if (view === 'dragster') {
      // rails converging to the front axle far ahead, front wing, butterfly wheel
      const d = 12, s = cam.f / d;
      const laneX = S.lane * 7.5;
      const [ax, ay] = proj(d, 0, 0);
      ctx.strokeStyle = shade('#9a9a9a', k); ctx.lineWidth = Math.max(2, W * 0.012);
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(W / 2 + side * W * 0.22, H); ctx.lineTo(ax + side * s * 0.9, ay - s * 0.6); ctx.stroke(); }
      // front wheels
      ctx.fillStyle = '#111'; ctx.fillRect(ax - s * 1.6, ay - s * 2.2, s * 0.35, s * 2.2); ctx.fillRect(ax + s * 1.25, ay - s * 2.2, s * 0.35, s * 2.2);
      // front wing
      ctx.fillStyle = shade(S.accent || '#ffb000', k); ctx.fillRect(ax - s * 2.6, ay - s * 2.9, s * 5.2, s * 0.5);
      // butterfly wheel + cowl
      ctx.fillStyle = '#141416'; ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, dashTop + H * 0.1); ctx.quadraticCurveTo(W / 2, dashTop - H * 0.02, W, dashTop + H * 0.1); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2b2b2f'; ctx.lineWidth = W * 0.02; ctx.beginPath(); ctx.moveTo(W * 0.32, dashTop + H * 0.09); ctx.lineTo(W * 0.42, dashTop + H * 0.06); ctx.lineTo(W * 0.58, dashTop + H * 0.06); ctx.lineTo(W * 0.68, dashTop + H * 0.09); ctx.stroke();
      return;
    }
    // hood
    ctx.fillStyle = shade(col, k);
    ctx.beginPath(); ctx.moveTo(-W * 0.1, H); ctx.lineTo(-W * 0.1, hoodY + H * 0.05); ctx.quadraticCurveTo(W / 2, hoodY - H * 0.04, W * 1.1, hoodY + H * 0.05); ctx.lineTo(W * 1.1, H); ctx.closePath(); ctx.fill();
    // sheen
    const gr = ctx.createLinearGradient(0, hoodY, 0, dashTop); gr.addColorStop(0, night ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, hoodY - H * 0.02, W, dashTop - hoodY + H * 0.02);
    // hood scoop / blower
    if (view === 'scoop') { ctx.fillStyle = shade(col, k * 0.8); ctx.beginPath(); ctx.moveTo(W * 0.36, hoodY + H * 0.02); ctx.lineTo(W * 0.64, hoodY + H * 0.02); ctx.lineTo(W * 0.60, hoodY - H * 0.045); ctx.lineTo(W * 0.40, hoodY - H * 0.045); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#0a0a0a'; ctx.fillRect(W * 0.41, hoodY - H * 0.043, W * 0.18, H * 0.018); }
    if (view === 'funny') { ctx.fillStyle = shade('#2a2a2e', k); ctx.fillRect(W * 0.40, hoodY - H * 0.09, W * 0.20, H * 0.11); ctx.fillStyle = shade('#c0c0c0', k); ctx.fillRect(W * 0.43, hoodY - H * 0.12, W * 0.14, H * 0.04); ctx.strokeStyle = shade('#8a8a8a', k); ctx.lineWidth = W * 0.012; ctx.beginPath(); ctx.moveTo(W * 0.06, H); ctx.lineTo(W * 0.14, hoodY - H * 0.25); ctx.lineTo(W * 0.86, hoodY - H * 0.25); ctx.lineTo(W * 0.94, H); ctx.stroke(); }
    // dash
    ctx.fillStyle = '#121316'; ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, dashTop + H * 0.03); ctx.quadraticCurveTo(W / 2, dashTop - H * 0.03, W, dashTop + H * 0.03); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2a2b30'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, dashTop + H * 0.03); ctx.quadraticCurveTo(W / 2, dashTop - H * 0.03, W, dashTop + H * 0.03); ctx.stroke();
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
    // ---- tachometer ----
    const spec = S.spec, red = spec.redline, top = Math.ceil(red / 1000) * 1000;
    const a0 = Math.PI * 0.78, a1 = Math.PI * 2.22; // sweep 260°
    const ang = (rpm) => a0 + (a1 - a0) * clamp(rpm / top, 0, 1);
    ctx.beginPath(); ctx.arc(cx, cy, rad * 1.1, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
    ctx.lineWidth = rad * 0.16; ctx.lineCap = 'butt';
    ctx.strokeStyle = '#2a2d33'; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.86, a0, a1); ctx.stroke();
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
    // ---- readout row above the tach: gear | speed | shift light ----
    const ry = cy - rad * 1.1 - Math.max(30, H * 0.045);
    const gx = W * 0.22, sx = W / 2, lx = W * 0.78;
    txt('GEAR', gx, ry - rad * 0.42, rad * 0.2, '#8d8880', 'center');
    txt(h.gearLabel, gx, ry + rad * 0.12, rad * 0.95, h.shifting ? '#8d8880' : '#f1ebdc', 'center', DISPLAY, 700);
    if (S.autoShift) txt('AUTO', gx, ry + rad * 0.68, rad * 0.18, '#ffb000', 'center');
    txt('MPH', sx, ry - rad * 0.42, rad * 0.2, '#8d8880', 'center');
    txt(String(Math.round(h.mph)), sx, ry + rad * 0.12, rad * 0.95, '#f1ebdc', 'center', MONO, 600);
    if (h.status) txt(h.status.text, sx, ry + rad * 0.68, rad * 0.18, h.status.col, 'center');
    const sl = h.opt && h.rpm >= h.opt - red * 0.035 && !S.autoShift;
    ctx.beginPath(); ctx.arc(lx, ry + rad * 0.05, rad * 0.3, 0, Math.PI * 2); ctx.fillStyle = sl ? '#ffb000' : '#2a2000'; if (sl) { ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 22; } ctx.fill(); ctx.shadowBlur = 0;
    txt('SHIFT', lx, ry - rad * 0.42, rad * 0.2, '#8d8880', 'center');
    // ---- top strip: timers ----
    const ty = sat + 22;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, sat, W, 58);
    txt('R/T', W * 0.5 - 4, ty - 8, 12, '#8d8880', 'right');
    txt(h.rt, W * 0.5 - 4, ty + 12, 22, h.rtCol || '#f1ebdc', 'right', MONO, 600);
    txt('E/T', W * 0.5 + 8, ty - 8, 12, '#8d8880', 'left');
    txt(h.et, W * 0.5 + 8, ty + 12, 22, '#f1ebdc', 'left', MONO, 600);
    // mini tree (top-left)
    drawMiniTree(S, 14 + (S.safeLeft || 0), sat + 66, night);
    // position bar (top-right)
    drawPosBar(S, W - 14 - (S.safeRight || 0), sat + 72);
    // centre message
    if (h.msg && h.msg.t > 0) {
      ctx.globalAlpha = clamp(h.msg.t / 0.4, 0, 1);
      const my = H * 0.30;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; const mw = Math.min(W * 0.9, h.msg.text.length * 15 + 40); ctx.fillRect(W / 2 - mw / 2, my - 22, mw, 44);
      txt(h.msg.text, W / 2, my, 26, h.msg.col || '#f1ebdc', 'center', DISPLAY, 700);
      ctx.globalAlpha = 1;
    }
    if (h.sub && h.sub.t > 0) { ctx.globalAlpha = clamp(h.sub.t / 0.3, 0, 1); txt(h.sub.text, W / 2, H * 0.30 + 34, 15, h.sub.col || '#d9d3c4', 'center'); ctx.globalAlpha = 1; }
    // burnout / heat bar
    if (h.heatBar !== undefined) {
      const bw = Math.min(260, W * 0.6), bx = W / 2 - bw / 2, by = H * 0.36;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx - 8, by - 26, bw + 16, 48);
      txt('TIRE TEMP', bx, by - 14, 12, '#8d8880');
      ctx.fillStyle = '#2a2d33'; ctx.fillRect(bx, by, bw, 10);
      ctx.fillStyle = '#1f9b45'; ctx.fillRect(bx + bw * 0.62, by, bw * 0.24, 10); // sweet spot 0.95..1.15 of 1.55 scale
      const f = clamp(h.heatBar / 1.55, 0, 1);
      ctx.fillStyle = h.heatBar > 1.18 ? '#ff2a3d' : h.heatBar >= 0.95 ? '#2be35a' : '#ffb000'; ctx.fillRect(bx, by + 2, bw * f, 6);
    }
  }
  function drawMiniTree(S, x, y, night) {
    const r = 9, gap = 20;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - 4, y - 8, 84, gap * 7.4 + 12);
    const me = S.lane === -1 ? S.tree.left : S.tree.right, opp = S.lane === -1 ? S.tree.right : S.tree.left;
    treeColumn(x + 20, y, r, gap, S.lane === -1 ? me : opp, night);
    treeColumn(x + 58, y, r, gap, S.lane === -1 ? opp : me, night);
    txt(S.lane === -1 ? 'YOU' : 'RIVAL', x + 20, y + gap * 7.6 - 2, 10, S.lane === -1 ? '#ffb000' : '#8d8880', 'center');
    txt(S.lane === -1 ? 'RIVAL' : 'YOU', x + 58, y + gap * 7.6 - 2, 10, S.lane === -1 ? '#8d8880' : '#ffb000', 'center');
  }
  function drawPosBar(S, xr, y) {
    const w = Math.min(150, W * 0.36), x = xr - w;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - 8, y - 22, w + 16, 44);
    ctx.fillStyle = '#2a2d33'; ctx.fillRect(x, y - 1, w, 2);
    ctx.fillStyle = '#e9e4d3'; ctx.fillRect(x + w - 2, y - 8, 2, 16);
    const f = (v) => x + w * clamp(v / S.dist, 0, 1);
    if (S.opp) { ctx.fillStyle = '#8d8880'; ctx.beginPath(); ctx.arc(f(S.opp.progress), y - 6, 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.arc(f(S.player.progress), y + 6, 5, 0, Math.PI * 2); ctx.fill();
    txt('STRIPE', x + w, y + 16, 9, '#8d8880', 'right');
  }
  function clear() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#0B0C0E'; ctx.fillRect(0, 0, W, H); }
  return { attach, resize, drawScene, clear, stepParticles, spawnSmoke, particles, treeColumn, get W() { return W; }, get H() { return H; }, get portrait() { return portrait; } };
})();
