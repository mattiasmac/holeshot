const chromium = require('@sparticuz/chromium').default || require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], headless: true });
  const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:8765/gltest.html', { waitUntil: 'load' });
  for (const id of process.argv.slice(2)) {
    const info = await page.evaluate((c) => window.inspect(c), id);
    console.log(`== ${id}: L ${info.L} extent ${info.extent} minY ${info.minY} wheels ${info.wheels} paint ${JSON.stringify(info.paint)}`);
    for (const m of info.meshes.slice(0, 16)) console.log('   ', (m.n || '').slice(0, 18).padEnd(18), '|', (m.m || '').slice(0, 30).padEnd(30), 'sz', m.sz, 'c', m.c, 'minY', m.minY, m.col, 'map', m.map, 'met', m.met, 'tris', m.tris);
  }
  await browser.close();
})();
