// Plays a real race in the actual index.html under headless Chrome and screenshots it.
const chromium = require('@sparticuz/chromium').default || require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
(async () => {
  const [,, carId, nightFlag, outPrefix] = process.argv;
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], headless: true });
  const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const logs = []; page.on('console', m => { if (!/three\.js|Failed to load resource|WebGL: /.test(m.text())) logs.push(m.type() + ': ' + m.text()); }); page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#menu').classList.contains('on'), { timeout: 15000 });
  await page.evaluate((carId, night) => { Game.P.car = carId; if (!Game.P.owned.includes(carId)) Game.P.owned.push(carId); Game.P.settings.night = night === '1'; Game.P.settings.seenHow = true; Game.P.settings.sound = false; Game.P.settings.auto = true; window.__fastTest = 0.4; }, carId, nightFlag);
  await page.click('#mRace');
  await page.waitForFunction(() => Game.race && Game.race.phase === 'burnout', { timeout: 10000 });
  console.log('gl active:', await page.evaluate(() => R.gl3d), 'status:', await page.evaluate(() => GL.debug()));
  await page.evaluate(() => Game.skipBurnout());
  await page.waitForFunction(() => Game.race.phase === 'staging');
  await page.evaluate(() => { Game.leftDown({ timeStamp: Game.race.t0 + Game.race.clock * 1000 }); });   // press STAGE and hold
  await page.waitForFunction(() => Game.race.phase === 'staged' || Game.race.phase === 'tree', { timeout: 90000 });
  await page.screenshot({ path: `${outPrefix}_staged.png` });
  await page.waitForFunction(() => Game.race.phase === 'tree' && Game.race.player.treeStart !== null && Game.race.clock >= Game.race.player.green - 0.6, { timeout: 90000 });
  await page.evaluate(() => { Game.leftUp({ timeStamp: Game.race.t0 + Math.min(Game.race.clock, Game.race.player.green - 0.22) * 1000 }); });     // release on the last amber
  const shots = [1.2, 3.5, 6.5];
  for (const t of shots) {
    await page.waitForFunction((t) => Game.race.player.run.launched && (Game.race.clock - Game.race.player.launchedAt) >= t, { timeout: 300000 }, t);
    // shift like a decent driver while we wait: auto-shift is on for the test
    const info = await page.evaluate(() => { const r = Game.race, pr = r.player.run, ar = r.ai.run; return { t: (r.clock - r.player.launchedAt).toFixed(2), me: (pr.x / 0.3048).toFixed(0), rival: (ar.x / 0.3048).toFixed(0), mph: pr.mph.toFixed(0), rt: r.player.rt, phase: r.phase, gl: GL.debug() }; });
    await page.screenshot({ path: `${outPrefix}_t${t}.png` });
    console.log('shot', t, JSON.stringify(info));
  }
  await page.waitForFunction(() => document.querySelector('#slip').classList.contains('on'), { timeout: 180000 });
  await page.screenshot({ path: `${outPrefix}_slip.png` });
  console.log('slip shown. logs:', logs.slice(0, 8).join(' | ') || 'none');
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
