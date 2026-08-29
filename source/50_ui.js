/* ===================== UI ===================== */
const UI = (function () {
  const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const fmt = PH.fmtT, num = (n) => Math.round(n).toLocaleString('en-US');
  let lastOpts = null, tourney = null, dialVal = 12.0, lbTab = 'quarter';
  const safe = { top: 0, left: 0, right: 0, bottom: 0 };
  function readSafe() {
    const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0px);left:env(safe-area-inset-left,0px);right:env(safe-area-inset-right,0px);bottom:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden';
    document.body.appendChild(probe); const r = probe.getBoundingClientRect();
    safe.top = r.top; safe.left = r.left; safe.right = window.innerWidth - r.right; safe.bottom = window.innerHeight - r.bottom; probe.remove();
  }
  function show(id) { $$('.screen').forEach(s => s.classList.toggle('on', s.id === id)); if (id !== 'race') $('#race').classList.remove('on'); $('#slip').classList.remove('on'); window.scrollTo(0, 0); refreshPoints(); }
  function refreshPoints() { $$('.points').forEach(e => e.textContent = num(Game.P.points) + ' pts'); }
  let toastT = null;
  function toast(text, ms) { const t = $('#toast'); t.textContent = text; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms || 2200); }
  function seg(id, value, onChange) {
    const el = $(id); el.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.v === value); b.onclick = () => { el.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); onChange(b.dataset.v); }; });
  }

  /* ---------- menu ---------- */
  let menuTreeT = 0, menuTreeRaf = null;
  function drawMenuTree(ts) {
    const cv = $('#menuTree'); if (!$('#menu').classList.contains('on')) { menuTreeRaf = null; return; }
    const c = cv.getContext('2d'); const W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H);
    const cycle = (ts / 1000) % 5.2; // staging, ambers, green, hold, dark
    const st = { pre: cycle > 0.6, stage: cycle > 1.4, a1: false, a2: false, a3: false, green: false, red: false };
    const tree = Game.treeFor(Game.carById(Game.P.car));
    const t0 = 2.6;
    if (tree === 'pro') { st.a1 = st.a2 = st.a3 = cycle > t0 && cycle < t0 + 0.4; st.green = cycle >= t0 + 0.4 && cycle < 4.6; }
    else { st.a1 = cycle > t0 && cycle < t0 + 0.5; st.a2 = cycle > t0 + 0.5 && cycle < t0 + 1.0; st.a3 = cycle > t0 + 1.0 && cycle < t0 + 1.5; st.green = cycle >= t0 + 1.5 && cycle < 4.6; }
    c.fillStyle = '#141416'; c.fillRect(W * 0.12, 0, W * 0.76, H);
    const bulb = (x, y, r, on, col) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = on ? col : '#26262a'; c.shadowColor = col; c.shadowBlur = on ? r * 1.6 : 0; c.fill(); c.shadowBlur = 0; };
    const cx = W / 2, r = W * 0.17, gap = H / 8.2, y0 = gap * 0.8;
    bulb(cx - r * 0.7, y0, r * 0.4, st.pre, '#FFD84A'); bulb(cx + r * 0.7, y0, r * 0.4, st.pre, '#FFD84A');
    bulb(cx - r * 0.7, y0 + gap * 0.7, r * 0.4, st.stage, '#FFD84A'); bulb(cx + r * 0.7, y0 + gap * 0.7, r * 0.4, st.stage, '#FFD84A');
    bulb(cx, y0 + gap * 1.9, r, st.a1, '#FFB000'); bulb(cx, y0 + gap * 3.1, r, st.a2, '#FFB000'); bulb(cx, y0 + gap * 4.3, r, st.a3, '#FFB000');
    bulb(cx, y0 + gap * 5.5, r, st.green, '#2BE35A'); bulb(cx, y0 + gap * 6.7, r, false, '#FF2A3D');
    menuTreeRaf = requestAnimationFrame(drawMenuTree);
  }
  function renderMenu() {
    const P = Game.P, car = Game.carById(P.car), d = Game.dyno(car.id);
    $('#menuCar').innerHTML = `<div class="swatch" style="background:${car.color};border:1px solid #444"></div><div class="grow"><div class="name">${car.maker} ${car.name}</div><div class="spec">${car.cls} · ${Math.round(Game.specFor(car.id).hp)} hp · dyno ${fmt(d.et)} @ ${d.mph.toFixed(0)}</div></div><div class="points">${num(P.points)} pts</div>`;
    const done = Game.CHALLENGES.filter(c => P.challenges[c.id]).length;
    $('#mChalSub').textContent = `${done} of ${Game.CHALLENGES.length} complete`;
    $('#saveNote').style.display = Store.kind === 'memory' ? 'block' : 'none';
    $('#mRaceSub').textContent = `Quick race · ${Game.DIFF[P.settings.difficulty].label} · ${P.settings.auto ? 'auto shift' : 'manual'} · ${Game.treeFor(car) === 'pro' ? 'pro tree' : 'sportsman tree'}`;
    show('menu');
    if (!menuTreeRaf) menuTreeRaf = requestAnimationFrame(drawMenuTree);
  }

  /* ---------- modes ---------- */
  function renderModes() {
    const P = Game.P;
    seg('#segDiff', P.settings.difficulty, v => { P.settings.difficulty = v; Game.save(); $('#diffHint').textContent = Game.DIFF[v].desc; });
    $('#diffHint').textContent = Game.DIFF[P.settings.difficulty].desc;
    const d = Game.dyno(P.car); $('#clockSub').textContent = `Solo pass. Target ${fmt(d.et + 0.04, 2)} for the current build — beat it for double the purse.`;
    show('modes');
  }
  function startMode(mode) {
    const P = Game.P;
    if (mode === 'bracket') { dialVal = Math.round((Game.dyno(P.car).et + 0.05) * 100) / 100; renderDial(); return; }
    if (mode === 'tournament') { tourney = { round: 1, won: 0 }; go({ mode: 'tournament', round: 1, diff: 'rookie' }); return; }
    if (mode === 'clock') { go({ mode: 'clock', target: Math.round((Game.dyno(P.car).et + 0.04) * 100) / 100 }); return; }
    go({ mode });
  }
  function renderDial() {
    $('#dialVal').textContent = dialVal.toFixed(2);
    const b = Game.P.bests[Game.P.car]; const d = Game.dyno(Game.P.car);
    $('#dialHint').textContent = `Dyno predicts ${fmt(d.et, 2)}. ${b && b.et ? 'Your best is ' + fmt(b.et, 3) + '.' : 'No personal best yet.'} Pick a number you can run without going under.`;
    show('dial');
  }
  function go(opts) { lastOpts = opts; Game.start(opts); }

  /* ---------- garage ---------- */
  function renderGarage() {
    const P = Game.P, list = $('#garageList'); list.innerHTML = '';
    for (const car of PH.CARS) {
      const owned = P.owned.includes(car.id), sel = P.car === car.id;
      const spec = Game.specFor(car.id), d = Game.dyno(car.id), up = Game.upgradesFor(car.id), tune = Game.tuningFor(car.id);
      const el = document.createElement('div'); el.className = 'card' + (sel ? ' sel' : '') + (owned ? '' : ' locked');
      const gearsTxt = spec.trans === 'none' ? 'No gearbox' : spec.trans === 'single' ? 'Single speed' : `${car.gears.length}-speed ${spec.trans === 'clutchless' ? 'clutchless' : spec.trans === 'dct' ? 'DCT' : spec.trans}`;
      el.innerHTML = `<div class="head"><span class="cls">${car.cls} · tier ${car.tier}</span><span class="name">${car.maker} ${car.name}</span><span class="price">${owned ? (sel ? 'SELECTED' : 'OWNED') : num(car.price) + ' pts'}</span></div>
        <div class="specs"><div>Power<b>${Math.round(spec.hp)}</b>hp</div><div>Weight<b>${Math.round(spec.mass / 0.453592)}</b>lb</div><div>Dyno ET<b>${fmt(d.et, 2)}</b>${d.mph.toFixed(0)} mph</div><div>60 ft<b>${fmt(d.sixty, 2)}</b>${car.dist} ft</div></div>
        <p>${car.blurb} ${gearsTxt}, ${car.drive}. Real-world reference: ${car.target}.</p>`;
      if (owned) {
        for (const key of PH.UPGRADE_ORDER) {
          const max = PH.upgradeMax(car, key); if (!max) continue;
          const lvl = up[key] || 0, nxt = lvl + 1, cost = PH.upgradeCost(car, key, nxt);
          const row = document.createElement('div'); row.className = 'upg';
          row.innerHTML = `<span class="nm" title="${PH.UPGRADES[key].desc}">${PH.UPGRADES[key].name}</span><span class="dots">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span>`;
          const b = document.createElement('button'); b.className = 'btn small';
          if (lvl >= max) { b.textContent = 'Maxed'; b.disabled = true; }
          else { b.textContent = num(cost); if (P.points < cost) b.disabled = true; b.onclick = () => { if (Game.buyUpgrade(car.id, key)) { toast(PH.UPGRADES[key].name + ' stage ' + nxt + ' installed'); renderGarage(); } }; }
          row.appendChild(b); el.appendChild(row);
        }
        if (spec.trans !== 'single' && spec.trans !== 'none') {
          const t = document.createElement('div'); t.className = 'tune';
          const rec = Game.recommendedLaunch(car.id);
          t.innerHTML = `<div class="row between"><span class="eyebrow">Launch RPM</span><span class="mono" id="lr_${car.id}">${tune.launchRpm}</span></div><input type="range" min="${car.idle + 300}" max="${Math.round(car.redline * 0.92)}" step="100" value="${tune.launchRpm}" id="ls_${car.id}"><div class="hint">Two-step / transbrake RPM when you release the launch button. Dyno's pick for this build: <b>${rec}</b>. Higher = harder hit, more wheelspin risk. Lower = softer, may bog.</div>`;
          el.appendChild(t);
          const sl = t.querySelector('input');
          sl.addEventListener('input', () => { tune.launchRpm = +sl.value; $('#lr_' + car.id).textContent = sl.value; });
          sl.addEventListener('change', () => { Game.save(); const dd = Game.dyno(car.id); el.querySelector('.specs').children[2].innerHTML = `Dyno ET<b>${fmt(dd.et, 2)}</b>${dd.mph.toFixed(0)} mph`; el.querySelector('.specs').children[3].innerHTML = `60 ft<b>${fmt(dd.sixty, 2)}</b>${car.dist} ft`; });
        }
        if (!sel) { const b = document.createElement('button'); b.className = 'btn primary wide'; b.style.marginTop = '10px'; b.textContent = 'Select this car'; b.onclick = () => { P.car = car.id; Game.save(); renderGarage(); }; el.appendChild(b); }
      } else {
        const b = document.createElement('button'); b.className = 'btn ' + (P.points >= car.price ? 'primary' : '') + ' wide'; b.style.marginTop = '8px';
        b.textContent = P.points >= car.price ? `Buy for ${num(car.price)} pts` : `Need ${num(car.price - P.points)} more pts`;
        if (P.points < car.price) b.disabled = true;
        b.onclick = () => { if (Game.buyCar(car.id)) { toast(car.name + ' is in your garage'); renderGarage(); } };
        el.appendChild(b);
      }
      list.appendChild(el);
    }
    show('garage');
  }

  /* ---------- challenges ---------- */
  function renderChallenges() {
    const P = Game.P, list = $('#chalList'); list.innerHTML = '';
    for (const c of Game.CHALLENGES) {
      const done = !!P.challenges[c.id];
      const el = document.createElement('div'); el.className = 'chal' + (done ? ' done' : '');
      el.innerHTML = `<div class="mark">${done ? '✓' : ''}</div><div class="grow"><div class="t">${c.t}</div><div class="d">${c.d}</div></div><div class="r">${done ? 'paid' : '+' + num(c.r)}</div>`;
      list.appendChild(el);
    }
    show('challenges');
  }

  /* ---------- leaderboard ---------- */
  async function renderLeaderboard() {
    show('leaderboard');
    const body = $('#lbBody'); body.innerHTML = '<p class="muted">Loading…</p>';
    seg('#lbTabs', lbTab, v => { lbTab = v; renderLeaderboard(); });
    const P = Game.P;
    if (lbTab === 'mine') {
      let html = '<table class="lb"><tr><th>Car</th><th>Best ET</th><th>MPH</th><th>60 ft</th><th>Best R/T</th></tr>';
      let any = false;
      for (const car of PH.CARS) { const b = P.bests[car.id]; if (!b) continue; any = true; html += `<tr><td>${car.name}</td><td>${fmt(b.et)}</td><td>${b.mph ? b.mph.toFixed(2) : '—'}</td><td>${fmt(b.sixty)}</td><td>${fmt(b.rt)}</td></tr>`; }
      html += '</table>';
      body.innerHTML = any ? html : '<p class="muted">Make a pass and your best times will show up here.</p>';
      return;
    }
    const board = await Game.getLeaderboard();
    const rows = board[lbTab] || [];
    if (!rows.length) { body.innerHTML = `<p class="muted">${lbTab === 'rt' ? 'No reaction times posted yet.' : 'No runs posted yet. Be the first name on the board.'}</p>`; return; }
    let html = `<table class="lb"><tr><th>#</th><th>Driver</th><th>Car</th><th>${lbTab === 'rt' ? 'R/T' : 'ET'}</th><th>${lbTab === 'rt' ? 'ET' : 'MPH'}</th></tr>`;
    rows.forEach((r, i) => { html += `<tr class="${r.n === P.name ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.n)}</td><td>${esc(r.c)}</td><td>${lbTab === 'rt' ? fmt(r.rt) : fmt(r.et)}</td><td>${lbTab === 'rt' ? fmt(r.et) : (r.mph || 0).toFixed(2)}</td></tr>`; });
    html += '</table>';
    html += `<p class="tut" style="margin-top:10px">${Store.kind === 'shared' ? 'Shared board — everyone playing this build posts here.' : 'This device only. Host the app online to share a board.'}</p>`;
    body.innerHTML = html;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- settings ---------- */
  function renderSettings() {
    const P = Game.P, s = P.settings;
    $('#setName').value = P.name;
    $('#setName').onchange = () => { P.name = ($('#setName').value.trim().toUpperCase() || 'DRIVER').slice(0, 12); $('#setName').value = P.name; Game.save(); };
    seg('#segShift', s.auto ? 'auto' : 'manual', v => { s.auto = v === 'auto'; Game.save(); });
    seg('#segTree', s.tree || 'auto', v => { s.tree = v; Game.save(); });
    seg('#segStage', s.deep ? 'deep' : 'shallow', v => { s.deep = v === 'deep'; Game.save(); });
    seg('#segLane', s.lane, v => { s.lane = v; Game.save(); });
    seg('#segTime', s.night ? 'night' : 'day', v => { s.night = v === 'night'; Game.save(); });
    seg('#segSound', s.sound ? 'on' : 'off', v => { s.sound = v === 'on'; Game.save(); Sfx.setEnabled(s.sound); });
    seg('#segRoute', s.route || 'media', v => { s.route = v; Game.save(); Sfx.setRoute(v); setTimeout(() => { $('#audioStatus').textContent = Sfx.status(); }, 600); });
    $('#testSound').onclick = () => { Sfx.setEnabled(true); Sfx.testTone(); setTimeout(() => { $('#audioStatus').textContent = Sfx.status(); Sfx.setEnabled(s.sound); }, 700); };
    $('#audioStatus').textContent = Sfx.status();
    armConfirm($('#resetBtn'), 'Reset all progress', 'Tap again to wipe everything', () => { Game.reset(); toast('Progress reset'); renderSettings(); });
    $('#storageNote').textContent = Store.kind === 'shared' ? 'Progress is saved to your account for this app. The leaderboard is shared with everyone.' : Store.kind === 'local' ? 'Progress is saved on this device.' : 'Storage is unavailable here — progress lasts until you close the app.';
    show('settings');
  }

  /* ---------- race screen ---------- */
  const btnL = () => $('#btnL'), btnR = () => $('#btnR');
  function enterRace() { lPressed = false; btnL().classList.remove('held'); $$('.screen').forEach(s => s.classList.remove('on')); $('#race').classList.add('on'); $('#quitBtn').classList.add('on'); $('#slip').classList.remove('on'); if (menuTreeRaf) { cancelAnimationFrame(menuTreeRaf); menuTreeRaf = null; } }
  function leaveRace() { $('#slip').classList.remove('on'); renderMenu(); }
  function setBtn(btn, label, sub, on) { btn.innerHTML = label + (sub ? `<span class="sub">${sub}</span>` : ''); btn.classList.toggle('on', !!on); }
  function phase(ph, race) {
    const L = btnL(), Rb = btnR(), autoShift = Game.S.autoShift;
    $('#skipBtn').classList.toggle('on', ph === 'burnout');
    if (ph === 'burnout') { setBtn(L, 'BURNOUT', 'hold', true); setBtn(Rb, '', '', false); }
    else if (ph === 'staging') { setBtn(L, 'STAGE', 'tap to roll in', true); setBtn(Rb, '', '', false); }
    else if (ph === 'rolling' || ph === 'staged' || ph === 'tree') { setBtn(L, 'LAUNCH', 'hold · release on the amber', true); setBtn(Rb, '', '', false); }
    else if (ph === 'run') { setBtn(L, 'PEDAL', 'hold to lift off the gas', true); if (!autoShift) { setBtn(Rb, 'SHIFT', '', true); Rb.classList.add('shift'); } else setBtn(Rb, '', '', false); }
    else if (ph === 'done') { setBtn(L, '', '', false); setBtn(Rb, '', '', false); }
    else { setBtn(L, '', '', false); setBtn(Rb, '', '', false); }
  }
  function coach(text) { const c = $('#coach'); if (!text) { c.classList.remove('on'); return; } c.textContent = text; c.classList.add('on'); }
  let lPressed = false;
  function bindRaceButtons() {
    const L = btnL(), Rb = btnR();
    // The press state lives here, not in a CSS class, so relabeling the button mid-hold can't lose the release.
    const down = (e) => { if (e.cancelable) e.preventDefault(); if (lPressed) return; lPressed = true; L.classList.add('held'); Game.leftDown(e); };
    const up = (e) => { if (e.cancelable) e.preventDefault(); if (!lPressed) return; lPressed = false; L.classList.remove('held'); Game.leftUp(e); };
    L.addEventListener('pointerdown', (e) => { try { L.setPointerCapture(e.pointerId); } catch (x) {} down(e); });
    L.addEventListener('pointerup', up); L.addEventListener('pointercancel', up);
    window.addEventListener('pointerup', (e) => { if (lPressed) up(e); }); // capture lost for any reason: still a release
    L.addEventListener('contextmenu', e => e.preventDefault());
    Rb.addEventListener('pointerdown', (e) => { e.preventDefault(); Game.rightDown(e); });
    Rb.addEventListener('contextmenu', e => e.preventDefault());
    $('#skipBtn').onclick = () => Game.skipBurnout();
    armConfirm($('#quitBtn'), 'Quit', 'Tap again to quit', () => Game.quit());
    // keyboard for desktop demos
    window.addEventListener('keydown', (e) => {
      if (!Game.race) return;
      if (e.code === 'Space' && !e.repeat) down(e);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'KeyS') { e.preventDefault(); Game.rightDown(e); }
    });
    window.addEventListener('keyup', (e) => { if (!Game.race) return; if (e.code === 'Space') up(e); });
  }

  /* ---------- timeslip ---------- */
  function showSlip(res, race) {
    const paper = $('#paper'); let html = '';
    const P = Game.P;
    if (res.drill) {
      html += `<div class="hdr">Practice tree<small>${race.treeType === 'pro' ? 'PRO TREE .400' : 'SPORTSMAN TREE .500'} · 60-FOOT DASHES</small></div>`;
      html += '<table>' + res.rts.map((r, i) => `<tr><td>Tree ${i + 1}</td><td>${r === null ? '<span class="grade red">RED</span>' : fmt(r) + gradeChip(r)}</td></tr>`).join('') + `<tr class="win"><td>Average (reds count .500)</td><td>${fmt(res.avg)}</td></tr></table>`;
      html += `<div class="pts"><div><span>Drill payout</span><span>+${num(res.pts)}</span></div>${res.newly.map(c => `<div><span>Challenge · ${c.t}</span><span>+${num(c.r)}</span></div>`).join('')}<div class="tot"><span>Balance</span><span>${num(P.points)} pts</span></div></div>`;
      html += `<div class="note">Reaction time runs from the green light until the front tire clears the stage beam. The car needs ${(race.player.run.rollout / 0.0254).toFixed(1)} in of rollout, so leave on the last amber, not on the green.</div>`;
      html += `<div class="actions"><button class="btn" id="sAgain">Run it again</button><button class="btn alt" id="sMenu">Menu</button></div>`;
      paper.innerHTML = html; $('#slip').classList.add('on');
      $('#sAgain').onclick = () => go(lastOpts); $('#sMenu').onclick = () => { Game.stop(); leaveRace(); };
      return;
    }
    const r = res.run, a = res.aiRun, solo = res.solo, dist = race.spec.dist;
    const c = (v, d) => v === undefined || v === null ? '—' : v.toFixed(d === undefined ? 3 : d);
    const rtCell = (rt, foul) => foul ? `<span class="grade red">RED</span> ${rt === null ? '' : c(rt)}` : (rt === null ? 'no time' : c(rt) + gradeChip(rt));
    html += `<div class="hdr">${race.mode === 'tournament' ? 'Tournament · round ' + race.round : race.mode === 'bracket' ? 'Bracket race' : race.mode === 'clock' ? 'Beat the clock' : 'Quick race'}<small>${dist} FT · ${race.treeType === 'pro' ? 'PRO TREE .400' : 'SPORTSMAN TREE .500'} · ${res.diff.label.toUpperCase()}${P.settings.deep ? ' · DEEP STAGED' : ''}</small></div>`;
    html += `<div class="verdict ${res.win ? 'win' : 'lose'}">${race.mode === 'clock' ? (res.win ? 'UNDER THE CLOCK' : 'OVER THE CLOCK') : (res.win ? (res.holeshot ? 'HOLESHOT WIN' : 'WIN LIGHT') : 'LOSS')}</div>`;
    let mtxt = res.reason;
    if (res.margin !== null && !res.foul && !res.aiFoul) mtxt += ` · margin ${Math.abs(res.margin).toFixed(4)} s (about ${(Math.abs(res.margin) * (r.v || 1) / 0.3048).toFixed(0)} ft)`;
    if (race.mode === 'clock') mtxt = `Target ${fmt(res.target, 2)} · ${res.reason}`;
    if (race.mode === 'bracket') mtxt += ` · dials ${fmt(res.dial, 2)} vs ${fmt(res.aiDial, 2)}`;
    html += `<div class="margin">${mtxt}</div>`;
    html += `<table><tr><th></th><th>${esc(P.name)}<br>${esc(race.car.name)}</th>${solo ? '' : `<th>${esc(res.aiName)}<br>rival</th>`}</tr>`;
    html += `<tr><td>R/T</td><td>${rtCell(res.rt, res.foul)}</td>${solo ? '' : `<td>${rtCell(res.aiRt, res.aiFoul)}</td>`}</tr>`;
    const row = (label, key) => `<tr><td>${label}</td><td>${c(r.splits[key])}</td>${solo ? '' : `<td>${c(a.splits[key])}</td>`}</tr>`;
    html += row("60'", 60) + row("330'", 330) + row("660'", 660);
    html += `<tr><td>660' mph</td><td>${c(r.mph660, 2)}</td>${solo ? '' : `<td>${c(a.mph660, 2)}</td>`}</tr>`;
    if (dist === 1320) html += row("1000'", 1000);
    html += `<tr class="win"><td>${dist}' ET</td><td>${c(r.et)}</td>${solo ? '' : `<td>${c(a.et)}</td>`}</tr>`;
    html += `<tr class="win"><td>MPH</td><td>${c(r.trapMph, 2)}</td>${solo ? '' : `<td>${c(a.trapMph, 2)}</td>`}</tr></table>`;
    // shifts line
    if (r.shifts.length && res.summary.manual) html += `<div class="note">Shifts: ${r.shifts.map(s => `${s.gear}<span class="grade ${s.grade === 'perfect' ? 'perfect' : s.grade === 'good' ? 'good' : ''}">${s.grade}</span>`).join(' ')}${r.spinTotal > 0.15 ? ` · wheelspin ${r.spinTotal.toFixed(2)}s` : ''}${r.bog ? ' · bogged at launch' : ''}</div>`;
    else if (r.spinTotal > 0.15 || r.bog) html += `<div class="note">${r.spinTotal > 0.15 ? `Wheelspin ${r.spinTotal.toFixed(2)}s. ` : ''}${r.bog ? 'Bogged at launch — try a higher launch RPM.' : ''}</div>`;
    html += `<div class="pts">${res.lines.map(l => `<div><span>${l[0]}</span><span>${l[1] ? '+' + num(l[1]) : ''}</span></div>`).join('')}${res.newly.map(cc => `<div><span>Challenge · ${cc.t}</span><span>+${num(cc.r)}</span></div>`).join('')}<div class="tot"><span>Purse${res.pb ? ' · new personal best' : ''}</span><span>+${num(res.total + res.newly.reduce((s, x) => s + x.r, 0))}</span></div><div><span>Balance</span><span>${num(P.points)} pts</span></div></div>`;
    // actions
    let actions = '';
    if (race.mode === 'tournament') {
      if (res.win && race.round < 3) actions = `<button class="btn" id="sNext">Next round</button><button class="btn alt" id="sMenu">Menu</button>`;
      else if (res.win) { actions = `<button class="btn" id="sAgain">Run it back</button><button class="btn alt" id="sMenu">Menu</button>`; html = html.replace('WIN LIGHT', 'CHAMPION').replace('HOLESHOT WIN', 'CHAMPION'); }
      else actions = `<button class="btn" id="sAgain">New ladder</button><button class="btn alt" id="sMenu">Menu</button>`;
    } else actions = `<button class="btn" id="sAgain">Race again</button><button class="btn alt" id="sGarage">Garage</button><button class="btn alt" id="sMenu">Menu</button>`;
    html += `<div class="actions">${actions}</div>`;
    paper.innerHTML = html; $('#slip').classList.add('on');
    const again = $('#sAgain'); if (again) again.onclick = () => { Game.stop(); if (race.mode === 'tournament') { tourney = { round: 1, won: 0 }; go({ mode: 'tournament', round: 1, diff: 'rookie' }); } else go(lastOpts); };
    const nxt = $('#sNext'); if (nxt) nxt.onclick = () => { Game.stop(); const rd = race.round + 1; go({ mode: 'tournament', round: rd, diff: rd === 2 ? 'pro' : 'elite' }); };
    const gar = $('#sGarage'); if (gar) gar.onclick = () => { Game.stop(); renderGarage(); };
    $('#sMenu').onclick = () => { Game.stop(); leaveRace(); };
    if (res.newly.length) toast('Challenge complete: ' + res.newly[0].t, 3000);
  }
  function armConfirm(btn, label, armedLabel, fn) {
    let armed = null;
    btn.onclick = () => { if (armed) { clearTimeout(armed); armed = null; btn.textContent = label; fn(); return; } btn.textContent = armedLabel; armed = setTimeout(() => { armed = null; btn.textContent = label; }, 2500); };
  }
  function openHow(beforeRace) {
    const box = $('#howSkip'); box.checked = beforeRace ? true : !!Game.P.settings.seenHow;
    const done = () => { Game.P.settings.seenHow = box.checked; Game.save(); if (beforeRace) go({ mode: 'quick' }); else renderMenu(); };
    const btn = $('#howGo'); btn.textContent = beforeRace ? 'Got it — stage up' : 'Back to menu'; btn.onclick = done;
    $('#howto [data-back]').onclick = done;
    show('howto');
  }
  function gradeChip(rt) { const g = PH.gradeRT(rt); return g.g === 'slow' || g.g === 'avg' ? '' : ` <span class="grade ${g.g}">${g.g}</span>`; }

  /* ---------- boot ---------- */
  function init() {
    readSafe(); window.addEventListener('resize', () => { readSafe(); R.resize(); }); window.addEventListener('orientationchange', () => setTimeout(() => { readSafe(); R.resize(); }, 250));
    R.attach($('#stage')); R.clear();
    Game.setUI({ enterRace, leaveRace, phase, coach, showSlip, safe });
    Sfx.setRoute(Game.P.settings.route || 'media');
    bindRaceButtons();
    $$('[data-back]').forEach(b => b.onclick = () => renderMenu());
    $('#mRace').onclick = () => { if (!Game.P.settings.seenHow) { openHow(true); return; } go({ mode: 'quick' }); };
    $('#mModes').onclick = renderModes; $('#mGarage').onclick = renderGarage; $('#mChal').onclick = renderChallenges; $('#mLB').onclick = renderLeaderboard; $('#mHow').onclick = () => openHow(false); $('#mSettings').onclick = renderSettings;
    $('#slip').addEventListener('click', (e) => { if (e.target === e.currentTarget && Game.race) { Game.stop(); leaveRace(); } });
    $$('#modes [data-mode]').forEach(b => b.onclick = () => startMode(b.dataset.mode));
    $('#dialMinus').onclick = () => { dialVal = Math.max(1, Math.round((dialVal - 0.01) * 100) / 100); $('#dialVal').textContent = dialVal.toFixed(2); };
    $('#dialPlus').onclick = () => { dialVal = Math.round((dialVal + 0.01) * 100) / 100; $('#dialVal').textContent = dialVal.toFixed(2); };
    $('#dialGo').onclick = () => go({ mode: 'bracket', dial: dialVal });
    // unlock audio on the first touch anywhere
    // unlock / keep audio alive on every gesture (iOS suspends contexts on interruptions and the silent switch)
    const unlock = () => { if (Game.P.settings.sound) Sfx.unlock(); };
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('touchmove', e => { if (!e.target.closest('.scroll,.paper')) e.preventDefault(); }, { passive: false });
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) { navigator.serviceWorker.register('sw.js').catch(() => {}); }
    renderMenu();
  }
  return { init, toast, renderMenu, safe };
})();

Store.ready(1500).then(() => Game.load()).then(() => UI.init()).catch((e) => { console.error(e); UI.init(); });
