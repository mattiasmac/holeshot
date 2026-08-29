const chromium = require('@sparticuz/chromium').default || require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], headless: true });
  const page = await browser.newPage(); await page.setViewport({ width: 320, height: 240, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:8765/gltest.html', { waitUntil: 'load' });
  for (const car of ['ctr', 'promod', 'plaid']) {
    await page.reload({ waitUntil: 'load' });
    const info = await page.evaluate(async (car) => { const r = await window.inspect(car); const names = {}; r.meshes.forEach(m => { names[m.m] = (names[m.m] || 0) + m.tris; }); return { paint: r.paint, names }; }, car);
    console.log(car, 'paint:', JSON.stringify(info.paint), '\n   materials:', JSON.stringify(info.names));
  }
  await browser.close();
})();
