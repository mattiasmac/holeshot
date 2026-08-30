// Screenshot the 3D scene via headless Chrome (SwiftShader WebGL).
const chromium = require('@sparticuz/chromium').default || require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core'); const fs = require('fs');
(async () => {
  const [,, W, H, shotsJson, out] = process.argv;
  const shots = JSON.parse(shotsJson);
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], headless: true });
  const page = await browser.newPage(); await page.setViewport({ width: +W, height: +H, deviceScaleFactor: 1 });
  const logs = []; page.on('console', m => logs.push(m.type() + ': ' + m.text())); page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:8765/gltest.html', { waitUntil: 'load' });
  for (const sh of shots) {
    const info = await page.evaluate((c, o) => window.show(c, o), sh.car, sh.opts);
    await page.screenshot({ path: `${out}/${sh.name}.png` });
    console.log(sh.name, JSON.stringify(info));
  }
  await browser.close();
  fs.writeFileSync(`${out}/log.txt`, logs.join('\n')); if (logs.length) console.log('LOGS:\n' + logs.filter(l => !/three.js|WebGL: /.test(l)).slice(0, 12).join('\n'));
})().catch(e => { console.error('ERR', e); process.exit(1); });
