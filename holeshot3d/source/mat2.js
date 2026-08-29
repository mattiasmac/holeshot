const chromium = require('@sparticuz/chromium').default || require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], headless: true });
  const page = await browser.newPage(); await page.setViewport({ width: 320, height: 240, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:8765/gltest.html', { waitUntil: 'load' });
  const info = await page.evaluate(async () => {
    await window.show('plaid', { lights: 'run', camXFt: 200, oppAhead: 40 });
    const g = GL._scene.children.find(o => o.userData && o.userData.L && o.type === 'Group');
    const out = [];
    g.traverse(o => { if (o.isMesh) { const m = o.material; out.push({ mesh: o.name, mat: m.name, type: m.type, color: m.color.getHexString(), map: !!m.map, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite, alphaTest: m.alphaTest, side: m.side, met: m.metalness, rough: m.roughness, blending: m.blending, tris: o.geometry.index ? o.geometry.index.count / 3 : 0 }); } });
    return { paintLen: g.userData.paint.length, out };
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})();
