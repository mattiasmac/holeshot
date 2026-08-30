const chromium = require('@sparticuz/chromium').default || require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
(async () => {
  const cars = process.argv.slice(2);
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], headless: true });
  const page = await browser.newPage(); await page.setViewport({ width: 320, height: 240, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:8765/gltest.html', { waitUntil: 'load' });
  for (const car of cars) {
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(async (car) => { document.getElementById('stage').style.display = 'none'; await window.show(car.replace('_side', ''), { lights: 'run', camXFt: 200, oppAhead: 40 }); const L = GL.debug().car.L; const cz = -(240) + L / 2; if (car === 'funny_side') { GL.debugView([-6.5 + 26, 5, cz - 2], [-6.5, 2.5, cz], 320, 240); } else GL.debugView([-6.5 + 14, 7, cz + 22], [-6.5, 2, cz], 320, 240); }, car);
    await page.screenshot({ path: `/tmp/gl/or_${car}.png` });
  }
  await browser.close();
})();
