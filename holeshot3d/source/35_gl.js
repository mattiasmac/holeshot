/* ===================== 3D layer (three.js) =====================
   World coordinates: x = lateral ft (right +), y = up ft, z = -distance ft (track runs toward -z).
   The 2D canvas sits on top with a transparent background and draws cockpit, HUD and smoke.
   Everything here is optional: if THREE is missing or WebGL fails, R draws the classic 2D world. */
const GL = (function () {
  const FT = PH.FT_M, clamp = PH.clamp;
  let ok = false, renderer = null, scene, camera, world = {}, cfgAll = null, night = null;
  let car = { id: null, group: null, wheels: [], spec: null, color: null, status: 'none', L: 16, placeholder: null };
  let treeBulbs = [], boards = { L: null, R: null }, lastBoard = { L: '', R: '' };
  let pointLights = [];
  const T = () => window.THREE;

  function init(canvas) {
    if (typeof window === 'undefined' || !window.THREE) return false;
    const THREE = T();
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, 1, 1.5, 3200);
    scene.add(camera);
    buildEnvironment();
    ok = true;
    return true;
  }
  function resize(W, H) { if (!ok) return; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }

  /* ---------- helpers ---------- */
  function canvasTex(w, h, draw, repeat) {
    const THREE = T(); const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function std(color, opts) { const THREE = T(); return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0.0 }, opts || {})); }
  function basic(color, opts) { const THREE = T(); return new THREE.MeshBasicMaterial(Object.assign({ color, toneMapped: false }, opts || {})); }
  function box(w, h, d, mat, x, y, z) { const THREE = T(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }

  /* ---------- static world ---------- */
  function buildEnvironment() {
    const THREE = T(), W = world;
    // lights
    W.hemi = new THREE.HemisphereLight(0xbfd6f2, 0x556633, 1.0); scene.add(W.hemi);
    W.sun = new THREE.DirectionalLight(0xfff1dc, 2.2); W.sun.position.set(-60, 120, 40); scene.add(W.sun);
    // environment reflections: tiny equirect gradient → PMREM
    try {
      const data = new Uint8Array(64 * 32 * 4); for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) { const i = (y * 64 + x) * 4, t = y / 31; const sky = [0.55 + 0.4 * (1 - t), 0.72, 0.95], gnd = [0.32, 0.36, 0.26]; const k = t < 0.5 ? 0 : (t - 0.5) * 2; data[i] = 255 * ((sky[0] * (1 - k) + gnd[0] * k)); data[i + 1] = 255 * ((sky[1] * (1 - k) + gnd[1] * k)); data[i + 2] = 255 * ((sky[2] * (1 - k) + gnd[2] * k)); data[i + 3] = 255; }
      const eq = new THREE.DataTexture(data, 64, 32); eq.mapping = THREE.EquirectangularReflectionMapping; eq.colorSpace = THREE.SRGBColorSpace; eq.needsUpdate = true;
      const pm = new THREE.PMREMGenerator(renderer); W.env = pm.fromEquirectangular(eq).texture; scene.environment = W.env; pm.dispose();
    } catch (e) { /* reflections are a bonus */ }
    // sky dome (vertex-coloured, unlit)
    const skyGeo = new THREE.SphereGeometry(2600, 24, 12); const cols = []; const pos = skyGeo.attributes.position;
    W.skyCols = new Float32Array(pos.count * 3); skyGeo.setAttribute('color', new THREE.BufferAttribute(W.skyCols, 3));
    W.sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, toneMapped: false, depthWrite: false })); W.sky.renderOrder = -10; scene.add(W.sky);
    // sun + clouds + stars
    const sunTex = canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,248,225,1)'); g.addColorStop(0.25, 'rgba(255,240,200,.7)'); g.addColorStop(1, 'rgba(255,235,190,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
    W.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, fog: false, toneMapped: false, depthWrite: false })); W.sunSprite.scale.set(700, 700, 1); W.sunSprite.position.set(900, 900, -2000); scene.add(W.sunSprite);
    const cloudTex = canvasTex(256, 128, (c) => { c.clearRect(0, 0, 256, 128); for (let i = 0; i < 14; i++) { const x = 30 + rnd() * 196, y = 40 + rnd() * 50, r = 22 + rnd() * 30; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 128); } });
    W.clouds = new THREE.Group(); for (let i = 0; i < 7; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, fog: false, toneMapped: false, depthWrite: false })); const w = 500 + rnd() * 600; sp.scale.set(w, w * 0.4, 1); sp.position.set(-1500 + rnd() * 3000, 500 + rnd() * 500, -1900 - rnd() * 400); W.clouds.add(sp); } scene.add(W.clouds);
    const starPos = []; for (let i = 0; i < 400; i++) { const a = rnd() * Math.PI * 2, e = 0.08 + rnd() * 0.9; starPos.push(Math.cos(a) * Math.cos(e) * 2500, Math.sin(e) * 2500, Math.sin(a) * Math.cos(e) * 2500); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    W.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 6, sizeAttenuation: true, fog: false, toneMapped: false, transparent: true, opacity: 0.9 })); scene.add(W.stars);
    // ground and tree line
    W.ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), std(0x5b6b38, { roughness: 1 })); W.ground.rotation.x = -Math.PI / 2; W.ground.position.set(0, -0.5, -1200); scene.add(W.ground);
    W.trees = new THREE.Group(); const treeMat = std(0x33502c, { roughness: 1 }); const treeGeo = new THREE.SphereGeometry(1, 6, 5);
    const inst = new THREE.InstancedMesh(treeGeo, treeMat, 260); const m4 = new THREE.Matrix4(); let n = 0;
    for (let i = 0; i < 260; i++) { const side = i % 2 ? 1 : -1; const z = -(-200 + (i >> 1) * 22); const x = side * (95 + rnd() * 120); const r = 9 + rnd() * 9; m4.makeScale(r * 1.3, r, r * 1.3); m4.setPosition(x, r * 0.6, z); inst.setMatrixAt(n++, m4); }
    inst.instanceMatrix.needsUpdate = true; W.trees.add(inst); scene.add(W.trees);
    // track surfaces
    const asphalt = canvasTex(256, 512, (c, w, h) => {
      c.fillStyle = '#3d3e42'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { const l = 40 + rnd() * 90; c.fillStyle = `rgba(${l},${l},${l + 4},${0.25 + rnd() * 0.5})`; c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); }
      // rubber groove in each lane (x scale: 256 px = 30 ft)
      const px = w / 30; for (const ln of [-1, 1]) for (const sd of [-1, 1]) { const cx = w / 2 + (ln * 6.5 + sd * 2.9) * px; const g = c.createLinearGradient(cx - 1.8 * px, 0, cx + 1.8 * px, 0); g.addColorStop(0, 'rgba(10,10,12,0)'); g.addColorStop(0.35, 'rgba(10,10,12,.55)'); g.addColorStop(0.5, 'rgba(14,14,16,.7)'); g.addColorStop(0.65, 'rgba(10,10,12,.55)'); g.addColorStop(1, 'rgba(10,10,12,0)'); c.fillStyle = g; c.fillRect(cx - 1.8 * px, 0, 3.6 * px, h); }
      c.fillStyle = '#d8d2bf'; c.fillRect(w / 2 - 0.35 * px, 0, 0.7 * px, h); c.fillStyle = '#cfc9b6'; c.fillRect(0.5 * px, 0, 0.4 * px, h); c.fillRect(w - 0.9 * px, 0, 0.4 * px, h);
    }, [1, 45]);
    W.track = new THREE.Mesh(new THREE.PlaneGeometry(30, 2700), std(0xffffff, { map: asphalt, roughness: 0.92 })); W.track.rotation.x = -Math.PI / 2; W.track.position.set(0, 0, -(1350 - 120)); scene.add(W.track);
    const concrete = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#8e8c86'; c.fillRect(0, 0, w, h); for (let i = 0; i < 5000; i++) { const l = 110 + rnd() * 60; c.fillStyle = `rgba(${l},${l},${l - 4},${0.3 + rnd() * 0.4})`; c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); } c.fillStyle = '#6f6d67'; c.fillRect(0, 0, w, 3); const px = w / 30; for (const ln of [-1, 1]) for (const sd of [-1, 1]) { const cx = w / 2 + (ln * 6.5 + sd * 2.9) * px; const g = c.createLinearGradient(cx - 1.8 * px, 0, cx + 1.8 * px, 0); g.addColorStop(0, 'rgba(10,10,12,0)'); g.addColorStop(0.5, 'rgba(12,12,14,.6)'); g.addColorStop(1, 'rgba(10,10,12,0)'); c.fillStyle = g; c.fillRect(cx - 1.8 * px, 0, 3.6 * px, h); } c.fillStyle = '#d8d2bf'; c.fillRect(w / 2 - 0.35 * px, 0, 0.7 * px, h); c.fillStyle = '#cfc9b6'; c.fillRect(0.5 * px, 0, 0.4 * px, h); c.fillRect(w - 0.9 * px, 0, 0.4 * px, h); }, [1, 28]);
    W.pad = new THREE.Mesh(new THREE.PlaneGeometry(30, 420), std(0xffffff, { map: concrete, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 })); W.pad.rotation.x = -Math.PI / 2; W.pad.position.set(0, 0.01, -120); scene.add(W.pad);
    const lineMat = std(0xece7d6, { polygonOffset: true, polygonOffsetFactor: -2 });
    const startLine = new THREE.Mesh(new THREE.PlaneGeometry(28, 1.4), lineMat); startLine.rotation.x = -Math.PI / 2; startLine.position.set(0, 0.02, 0); scene.add(startLine);
    W.finishGroup = new THREE.Group(); scene.add(W.finishGroup);
    // tire marks near the line
    const markMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0.35, polygonOffset: true, polygonOffsetFactor: -2, roughness: 1 });
    for (let i = 0; i < 18; i++) { const ln = i % 2 ? 1 : -1; const m = new THREE.Mesh(new THREE.PlaneGeometry(1 + rnd(), 8 + rnd() * 28), markMat); m.rotation.x = -Math.PI / 2; m.position.set(ln * 6.5 + (rnd() < 0.5 ? -1 : 1) * (2.3 + rnd() * 1.2), 0.02, -(8 + rnd() * 110)); scene.add(m); }
    // walls
    const wallMat = std(0xc9c4b6, { roughness: 0.9 });
    for (const sd of [-1, 1]) { const wl = box(1.2, 2.8, 2700, wallMat, sd * 15.6, 1.4, -(1350 - 120)); scene.add(wl); const cap = box(1.4, 0.2, 2700, std(0xe6e2d6), sd * 15.6, 2.85, -(1350 - 120)); scene.add(cap); }
    const BANNERS = [0x1d4fb8, 0xc8102e, 0xe0b100, 0x1c8f4e, 0xf26a1b, 0x5b2a86];
    const panelGeo = new THREE.BoxGeometry(0.12, 1.2, 28); const panels = new THREE.InstancedMesh(panelGeo, std(0xffffff, { roughness: 0.6 }), 100); let pn = 0; const col = new THREE.Color();
    for (let wx = 0; wx < 1500 && pn < 100; wx += 60) { const k = Math.floor(wx / 60) % BANNERS.length; if (k % 2) continue; for (const sd of [-1, 1]) { m4.makeTranslation(sd * 14.93, 1.6, -(wx + 14)); panels.setMatrixAt(pn, m4); col.setHex(BANNERS[k]); panels.setColorAt(pn, col); pn++; } }
    panels.count = pn; panels.instanceMatrix.needsUpdate = true; if (panels.instanceColor) panels.instanceColor.needsUpdate = true; scene.add(panels);
    // grandstand (left) and bleachers (right)
    buildStands();
    // tower behind the start line, right side
    const winTex = canvasTex(256, 128, (c, w, h) => { c.fillStyle = '#d7d3c8'; c.fillRect(0, 0, w, h); for (let f = 0; f < 3; f++) for (let i = 0; i < 6; i++) { c.fillStyle = '#7fa2c9'; c.fillRect(14 + i * 40, 14 + f * 36, 26, 22); } });
    W.tower = box(14, 22, 35, std(0xffffff, { map: winTex }), 26, 11, 42); scene.add(W.tower); scene.add(box(14.4, 1.6, 35.4, std(0x3a3a3a), 26, 22.8, 42));
    // light poles
    const poleGeo = new THREE.CylinderGeometry(0.35, 0.5, 42, 8); const poles = new THREE.InstancedMesh(poleGeo, std(0x5b5d62, { metalness: 0.3, roughness: 0.6 }), 40); const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 1.3, 2), std(0xdfe2e6, { emissive: 0x000000 }), 40); let k = 0;
    for (let px = 0; px <= 1800; px += 120) for (const sd of [-1, 1]) { m4.makeTranslation(sd * 19.5, 21, -px); poles.setMatrixAt(k, m4); m4.makeTranslation(sd * 18.2, 42, -px); heads.setMatrixAt(k, m4); k++; }
    poles.count = heads.count = k; poles.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true; scene.add(poles); scene.add(heads); W.heads = heads;
    // night light pools (additive discs) + point lights that follow the camera
    W.pools = new THREE.Group(); const poolTex = canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,240,200,.55)'); g.addColorStop(1, 'rgba(255,240,200,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
    for (let px = 0; px <= 1800; px += 120) { const m = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.03, -px); W.pools.add(m); } scene.add(W.pools);
    for (let i = 0; i < 3; i++) { const pl = new THREE.PointLight(0xffe6b0, 0, 300, 1.6); pl.position.set(0, 40, 0); scene.add(pl); pointLights.push(pl); }
    // beam markers: cones, photocells, distance boards
    const coneGeo = new THREE.ConeGeometry(0.85, 2.3, 10); const cones = new THREE.InstancedMesh(coneGeo, std(0xff6a1a), 10); const cells = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1.5, 0.9), std(0xf4f4f4), 10); let ci = 0;
    W.markers = new THREE.Group();
    for (const b of [60, 330, 660, 1000, 1320]) for (const sd of [-1, 1]) { m4.makeTranslation(sd * 13.3, 1.15, -b); cones.setMatrixAt(ci, m4); m4.makeTranslation(sd * 14.2, 0.75, -b); cells.setMatrixAt(ci, m4); ci++; }
    cones.instanceMatrix.needsUpdate = cells.instanceMatrix.needsUpdate = true; W.markers.add(cones); W.markers.add(cells);
    for (const b of [60, 330, 660, 1000, 1320]) { const t = canvasTex(256, 96, (c, w, h) => { c.fillStyle = '#161616'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd24a'; c.font = '700 64px "Arial Narrow", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(b), w / 2, h / 2 + 4); }); const m = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 3.4), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); m.position.set(-15.9, 5.2, -b); m.rotation.y = Math.PI / 2; m.userData.beam = b; W.markers.add(m); }
    scene.add(W.markers);
    // scoreboards on posts outside the walls (position set per race distance)
    W.boards = new THREE.Group(); scene.add(W.boards);
    for (const sd of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 20, 8), std(0x2b2b2e)); post.position.set(sd * 21, 10, 0); W.boards.add(post); const bx = box(16, 9, 0.8, std(0x0c0c10), sd * 21, 24.5, 0); W.boards.add(bx); const face = new THREE.Mesh(new THREE.PlaneGeometry(15.4, 8.4), new THREE.MeshBasicMaterial({ toneMapped: false })); face.position.set(sd * 21, 24.5, 0.41); W.boards.add(face); boards[sd === -1 ? 'L' : 'R'] = face; }
    // Christmas tree between the lanes at z = -15
    W.tree = new THREE.Group(); scene.add(W.tree);
    W.tree.add(box(5, 9.6, 1.0, std(0x121214), 0, 5.1, -15)); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.2, 8), std(0x2a2a2d)); pole.position.set(0, 0.6, -15); W.tree.add(pole);
    const glowTex = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.3, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
    const bulbGeo = new THREE.SphereGeometry(1, 12, 10);
    const mkBulb = (x, y, r, key, lane) => { const m = new THREE.Mesh(bulbGeo, basic(0x33343a)); m.scale.setScalar(r); m.position.set(x, y, -14.45); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })); sp.scale.setScalar(r * 5); sp.position.set(x, y, -14.2); sp.visible = false; W.tree.add(m); W.tree.add(sp); treeBulbs.push({ mesh: m, glow: sp, key, lane }); };
    for (const [lane, cx] of [['left', -1.2], ['right', 1.2]]) { const y0 = 9.4; mkBulb(cx - 0.4, y0, 0.22, 'pre', lane); mkBulb(cx + 0.4, y0, 0.22, 'pre', lane); mkBulb(cx - 0.4, y0 - 0.85, 0.22, 'stage', lane); mkBulb(cx + 0.4, y0 - 0.85, 0.22, 'stage', lane); mkBulb(cx, y0 - 2.1, 0.5, 'a1', lane); mkBulb(cx, y0 - 3.35, 0.5, 'a2', lane); mkBulb(cx, y0 - 4.6, 0.5, 'a3', lane); mkBulb(cx, y0 - 5.85, 0.5, 'green', lane); mkBulb(cx, y0 - 7.1, 0.5, 'red', lane); }
    // rival placeholder & blob shadow
    car.shadow = new THREE.Mesh(new THREE.PlaneGeometry(8, 18), new THREE.MeshBasicMaterial({ map: canvasTex(64, 128, (c) => { const g = c.createRadialGradient(32, 64, 0, 32, 64, 60); g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 128); }), transparent: true, depthWrite: false, toneMapped: false })); car.shadow.rotation.x = -Math.PI / 2; car.shadow.position.y = 0.04; car.shadow.visible = false; scene.add(car.shadow);
    car.placeholder = box(6.4, 4.2, 15.5, std(0x333333), 0, 2.1, 0); car.placeholder.visible = false; scene.add(car.placeholder);
    setNight(false, true);
  }
  function buildStands() {
    const THREE = T(), W = world, m4 = new THREE.Matrix4(), col = new THREE.Color();
    // left grandstand 80..1300 ft: front wall, seat rows, roof, columns, crowd
    scene.add(box(1, 6, 1220, std(0x7d7a72), -22.5, 3, -690));
    scene.add(box(1.2, 0.6, 1220, std(0x3a3a3c), -22.5, 6.3, -690));
    for (let r = 0; r < 7; r++) { const m = box(6.2, 2.4, 1220, std(r % 2 ? 0x2d5fb3 : 0xc62d34, { roughness: 0.8 }), -28 - r * 6.2, 9.5 + r * 3 - 1.2, -690); scene.add(m); const step = box(6.2, 0.8, 1220, std(0x6a6760), -28 - r * 6.2, 9.5 + r * 3 - 2.6, -690); scene.add(step); }
    scene.add(box(12, 3, 1220, std(0x6a6760), -66, 30.5, -690));
    const roof = box(38, 0.8, 1220, std(0xd9d7d0), -54, 37, -690); roof.rotation.z = 0.09; scene.add(roof);
    const colGeo = new THREE.CylinderGeometry(0.5, 0.5, 20, 8); const cols = new THREE.InstancedMesh(colGeo, std(0x55544f), 30); let n = 0;
    for (let z = 100; z < 1300; z += 50) { m4.makeTranslation(-36, 27, -z); cols.setMatrixAt(n++, m4); } cols.count = n; cols.instanceMatrix.needsUpdate = true; scene.add(cols);
    const CROWD = [0xe8d9c0, 0xc9a27a, 0x7a5a3c, 0x3c3c3c, 0xd8443b, 0x3b6bd8, 0xe6c93c, 0xf2f2f2, 0x2f8f4a];
    const headGeo = new THREE.SphereGeometry(0.45, 5, 3), bodyGeo = new THREE.BoxGeometry(1.1, 1.5, 0.7);
    const heads = new THREE.InstancedMesh(headGeo, std(0xd9b894, { roughness: 1 }), 5200), bodies = new THREE.InstancedMesh(bodyGeo, std(0xffffff, { roughness: 1 }), 5200); n = 0;
    for (let r = 0; r < 7; r++) for (let z = 82; z < 1298; z += 1.7 + rnd() * 0.5) { if (rnd() < 0.15 || n >= 5200) continue; const x = -27.5 - r * 6.2 + (rnd() - 0.5) * 2, y = 9.5 + r * 3; m4.makeTranslation(x, y + 0.75, -z); bodies.setMatrixAt(n, m4); col.setHex(CROWD[Math.floor(rnd() * CROWD.length)]); bodies.setColorAt(n, col); m4.makeTranslation(x, y + 1.9, -z); heads.setMatrixAt(n, m4); n++; }
    heads.count = bodies.count = n; heads.instanceMatrix.needsUpdate = bodies.instanceMatrix.needsUpdate = true; if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true; scene.add(heads); scene.add(bodies);
    // right bleachers 260..860
    scene.add(box(1, 4, 600, std(0x7d7a72), 21.5, 2, -560));
    for (let r = 0; r < 4; r++) { scene.add(box(5, 2, 600, std(r % 2 ? 0x8f8f93 : 0x7a7a7e), 25 + r * 5, 4.5 + r * 2.4 - 1, -560)); }
    const h2 = new THREE.InstancedMesh(headGeo, std(0xd9b894, { roughness: 1 }), 1500), b2 = new THREE.InstancedMesh(bodyGeo, std(0xffffff, { roughness: 1 }), 1500); n = 0;
    for (let r = 0; r < 4; r++) for (let z = 262; z < 858; z += 2 + rnd()) { if (rnd() < 0.3 || n >= 1500) continue; const x = 24.5 + r * 5 + (rnd() - 0.5) * 2, y = 4.5 + r * 2.4; m4.makeTranslation(x, y + 0.75, -z); b2.setMatrixAt(n, m4); col.setHex(CROWD[Math.floor(rnd() * CROWD.length)]); b2.setColorAt(n, col); m4.makeTranslation(x, y + 1.9, -z); h2.setMatrixAt(n, m4); n++; }
    h2.count = b2.count = n; h2.instanceMatrix.needsUpdate = b2.instanceMatrix.needsUpdate = true; if (b2.instanceColor) b2.instanceColor.needsUpdate = true; scene.add(h2); scene.add(b2);
  }
  function setDistance(dist) {
    const THREE = T(), W = world; if (W.dist === dist) return; W.dist = dist;
    W.boards.position.z = -(dist + 90);
    while (W.finishGroup.children.length) W.finishGroup.remove(W.finishGroup.children[0]);
    const lm = std(0xffffff, { polygonOffset: true, polygonOffsetFactor: -2 }), dk = std(0x141414, { polygonOffset: true, polygonOffsetFactor: -2 });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(28, 1.8), lm); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.02, -dist); W.finishGroup.add(fl);
    for (let i = 0; i < 8; i++) for (let r = 0; r < 2; r++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 4.5), (i + r) % 2 ? lm : dk); m.rotation.x = -Math.PI / 2; m.position.set(-14 + i * 3.5 + 0.875 + r * 1.75, 0.02, -(dist + 3.75 + r * 4.5)); W.finishGroup.add(m); }
    for (const m of W.markers.children) if (m.userData.beam) m.visible = m.userData.beam <= dist;
  }
  function setNight(on, force) {
    if (night === on && !force) return; night = on; const THREE = T(), W = world;
    const top = new THREE.Color(on ? 0x04050a : 0x3f7fcf), mid = new THREE.Color(on ? 0x0a0d1a : 0x7fb1e6), hz = new THREE.Color(on ? 0x3a2f1c : 0xe9e4d6);
    const pos = W.sky.geometry.attributes.position, c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const t = clamp(pos.getY(i) / 2600, -0.2, 1); if (t > 0.35) c.copy(mid).lerp(top, (t - 0.35) / 0.65); else c.copy(hz).lerp(mid, clamp(t / 0.35, 0, 1)); W.skyCols[i * 3] = c.r; W.skyCols[i * 3 + 1] = c.g; W.skyCols[i * 3 + 2] = c.b; }
    W.sky.geometry.attributes.color.needsUpdate = true;
    scene.fog = new THREE.Fog(on ? 0x1a1710 : 0xe2ddcf, on ? 120 : 260, on ? 1500 : 2500);
    W.hemi.intensity = on ? 0.32 : 1.0; W.hemi.color.setHex(on ? 0x8090b0 : 0xbfd6f2); W.hemi.groundColor.setHex(on ? 0x202020 : 0x556633);
    W.sun.intensity = on ? 0.15 : 2.2; W.sun.color.setHex(on ? 0x9fb0ff : 0xfff1dc);
    W.sunSprite.visible = !on; W.clouds.visible = !on; W.stars.visible = on; W.pools.visible = on;
    W.heads.material.emissive.setHex(on ? 0xfff0c0 : 0x000000); W.heads.material.emissiveIntensity = on ? 2.0 : 0;
    for (const pl of pointLights) pl.intensity = on ? 3800 : 0;
    scene.environment = on ? null : W.env || null;
    renderer.toneMappingExposure = on ? 0.9 : 1.05;
  }

  /* ---------- rival car ---------- */
  async function config() {
    if (cfgAll) return cfgAll;
    try { const r = await fetch('models/cars.json'); cfgAll = (await r.json()).cars || {}; } catch (e) { cfgAll = {}; }
    return cfgAll;
  }
  const loads = {};
  function prime(id, spec, color) {
    if (!ok) return;
    car.spec = spec; car.color = color;
    if (car.id === id && car.status === 'ready') { recolor(color); return; }
    if (car.group) { scene.remove(car.group); car.group = null; }
    car.id = id; car.status = 'loading'; car.wheels = [];
    loadCar(id, spec).then((g) => { if (car.id !== id) return; car.group = g; car.wheels = g.userData.wheels || []; car.L = g.userData.L || 16; scene.add(g); recolor(color); car.status = 'ready'; }).catch((e) => { console.warn('3D car unavailable', id, e && e.message); if (car.id === id) car.status = 'failed'; });
  }
  async function loadCar(id, spec) {
    const THREE = T(); const cfg = (await config())[id] || {};
    if (cfg.disabled) throw new Error('disabled');
    const group = new THREE.Group();
    let root = null, bbox = new THREE.Box3();
    if (!cfg.kitOnly) {
      const gltf = await new Promise((res, rej) => { const l = new THREE.GLTFLoader(); if (THREE.MeshoptDecoder) l.setMeshoptDecoder(THREE.MeshoptDecoder); l.load(`models/${cfg.file || id + '.glb'}`, res, undefined, rej); });
      root = gltf.scene;
      await applySpecGloss(gltf);
      const pivot = new THREE.Group(); pivot.add(root);
      if (cfg.rot) root.rotation.set(cfg.rot[0] || 0, cfg.rot[1] || 0, cfg.rot[2] || 0);
      pivot.rotation.y = (cfg.yaw || 0) + YAW0;
      pivot.updateMatrixWorld(true);
      // scale to real length along z
      bbox.setFromObject(pivot); let size = bbox.getSize(new THREE.Vector3());
      const L = cfg.lengthFt || 16; let sc = L / Math.max(size.z, 0.01); pivot.scale.setScalar(sc); pivot.updateMatrixWorld(true);
      // prop removal
      if (cfg.trimFt) { const t = cfg.trimFt, kill = []; const mb = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3(); bbox.setFromObject(pivot); const centerZ = (bbox.min.z + bbox.max.z) / 2;
        pivot.traverse((o) => { if (!o.isMesh) return; mb.setFromObject(o); mb.getCenter(c); mb.getSize(sz); let drop = false; if (t.halfX && Math.abs(c.x) > t.halfX) drop = true; if (t.maxY && mb.min.y > t.maxY) drop = true; if (t.halfZ && Math.abs(c.z - centerZ) > t.halfZ) drop = true; if (t.wideX && sz.x > t.wideX) drop = true; if (t.flat && sz.y < 0.25 && (sz.x > 9 || sz.z > 9)) drop = true; if (drop) kill.push(o); });
        for (const o of kill) o.parent.remove(o);
        bbox.setFromObject(pivot); size = bbox.getSize(new THREE.Vector3()); sc = L / Math.max(size.z, 0.01); pivot.scale.multiplyScalar(sc); pivot.updateMatrixWorld(true); }
      // centre on x/z, ground on wheel bottoms
      bbox.setFromObject(pivot); const ctr = bbox.getCenter(new THREE.Vector3());
      const wheels = findWheels(pivot); let groundY = bbox.min.y;
      if (wheels.length) { const wb = new THREE.Box3(); groundY = Infinity; for (const w of wheels) { wb.setFromObject(w); groundY = Math.min(groundY, wb.min.y); } }
      pivot.position.set(-ctr.x, -groundY + (cfg.groundFt || 0), -ctr.z);
      pivot.updateMatrixWorld(true);
      // materials: glass, paint candidates, wheel pivots
      // glass pass + explicit paint materials (palette-textured models keep their native paint)
      const paint = []; const paintNames = cfg.paintMats || [];
      pivot.traverse((o) => { if (!o.isMesh) return; const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) { if (!m) continue; const nm = (m.name || '') + ' ' + (o.name || ''); if (/glass|window|windshield|windscreen/i.test(nm) || (m.transmission && m.transmission > 0.3)) { m.transparent = true; m.opacity = 0.35; m.color.setHex(0x0e151d); m.metalness = 0.1; m.roughness = 0.05; m.depthWrite = false; continue; } if (paintNames.includes(m.name) && !paint.includes(m)) paint.push(m); } });
      group.userData.paint = paint;
      if (cfg.spinWheels !== false) group.userData.wheels = pivotWheels(wheels);
      group.add(pivot);
      group.userData.L = L;
    } else group.userData.L = cfg.lengthFt || 16;
    if (cfg.kit) buildKit(group, cfg, spec);
    return group;
  }
  let YAW0 = 0; // cars.json yaw values are verified per model for this renderer (nose toward -z)
  // GLTFLoader dropped KHR_materials_pbrSpecularGlossiness; rebuild those materials from the extension data
  async function applySpecGloss(gltf) {
    const THREE = T(); const parser = gltf.parser, defs = (parser.json && parser.json.materials) || [];
    const byName = {}; defs.forEach((d, i) => { if (d.extensions && d.extensions.KHR_materials_pbrSpecularGlossiness) byName[d.name || ('material_' + i)] = d.extensions.KHR_materials_pbrSpecularGlossiness; });
    if (!Object.keys(byName).length) return;
    // walk the meshes: GLTFLoader may hand meshes cloned materials, so patch what is actually on the scene
    const mats = new Set(); gltf.scene.traverse((o) => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m && byName[m.name]) mats.add(m); }); });
    for (const mat of mats) {
      const ext = byName[mat.name];
      if (!mat.color) continue;
      const d = ext.diffuseFactor || [1, 1, 1, 1]; mat.color.setRGB(d[0], d[1], d[2], THREE.LinearSRGBColorSpace);
      if (d[3] !== undefined && d[3] < 1) { mat.transparent = true; mat.opacity = d[3]; }
      if (ext.diffuseTexture && ext.diffuseTexture.index !== undefined) { try { const tex = await parser.getDependency('texture', ext.diffuseTexture.index); const img = tex && tex.image; if (tex && img && (img.width || 0) > 16) { tex.colorSpace = THREE.SRGBColorSpace; mat.map = tex; } } catch (e) {} }
      const sf = ext.specularFactor || [0.04, 0.04, 0.04]; const spec = (sf[0] + sf[1] + sf[2]) / 3;
      // keep it paint-like: fully metallic mirror-white reads as a ghost against the sky
      mat.metalness = clamp((spec - 0.04) / 0.6, 0, 0.7); mat.roughness = clamp(1 - (ext.glossinessFactor === undefined ? 0.5 : ext.glossinessFactor), 0.3, 1);
      mat.needsUpdate = true;
    }
  }
  function findWheels(pivot) {
    const THREE = T(); const out = [], b = new THREE.Box3(), s = new THREE.Vector3();
    pivot.traverse((o) => { if (!o.isMesh) return; b.setFromObject(o); b.getSize(s); const named = /wheel|tire|tyre|rim|circle/i.test(o.name || '') || /wheel|tire|tyre|rim/i.test((o.material && o.material.name) || ''); const roundish = s.y > 1.2 && s.y < 4.2 && Math.abs(s.y - s.z) < s.y * 0.3 && s.x < 2.6 && b.min.y < 0.8; if (roundish && (named || s.x < 1.9)) out.push(o); });
    return out;
  }
  function pivotWheels(wheels) {
    const THREE = T(); const out = [], b = new THREE.Box3(), c = new THREE.Vector3();
    for (const w of wheels) { b.setFromObject(w); b.getCenter(c); const parent = w.parent; const pv = new THREE.Group(); parent.add(pv); parent.updateMatrixWorld(true); pv.position.copy(parent.worldToLocal(c.clone())); pv.updateMatrixWorld(true); pv.attach(w); out.push(pv); }
    return out;
  }
  function recolor(color) {
    if (!car.group || !car.group.userData.paint) return; const THREE = T();
    for (const m of car.group.userData.paint) { m.color.set(color); m.metalness = Math.max(m.metalness || 0, 0.4); m.roughness = Math.min(m.roughness === undefined ? 0.4 : m.roughness, 0.45); m.needsUpdate = true; }
  }
  function buildKit(group, cfg, spec) {
    const THREE = T(); const kit = cfg.kit || {}, L = group.userData.L;
    const rubber = std(0x101012, { roughness: 0.95 }), chrome = std(0xd8d8de, { metalness: 0.9, roughness: 0.25 }), red = std(0xb81e1e, { roughness: 0.6 }), dark = std(0x2a2a2e, { metalness: 0.4, roughness: 0.5 });
    const rearZ = cfg.rearAxleZFt !== undefined ? cfg.rearAxleZFt : L / 2 - 0.23 * L, frontZ = cfg.frontAxleZFt !== undefined ? cfg.frontAxleZFt : -L / 2 + 0.2 * L;
    const track = cfg.trackFt || 6.6, tireD = (spec && spec.tire ? spec.tire : 33) / 12;
    const wheels = group.userData.wheels || (group.userData.wheels = []);
    if (kit.slicks) for (const sd of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(tireD / 2, tireD / 2, 1.5, 18), rubber); w.rotation.z = Math.PI / 2; const pv = new THREE.Group(); pv.position.set(sd * track / 2, tireD / 2, rearZ); pv.add(w); group.add(pv); wheels.push(pv); const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.55, 12), chrome); hub.rotation.z = Math.PI / 2; pv.add(hub); }
    if (kit.fronts) for (const sd of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.4, 16), rubber); w.rotation.z = Math.PI / 2; const pv = new THREE.Group(); pv.position.set(sd * (track / 2 - 0.4), 0.95, frontZ); pv.add(w); group.add(pv); wheels.push(pv); }
    if (kit.slicks || kit.fronts) { const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, track, 8), dark); axle.rotation.z = Math.PI / 2; axle.position.set(0, tireD / 2, rearZ); group.add(axle); }
    const cowlZ = cfg.cowlZFt !== undefined ? cfg.cowlZFt : -0.12 * L, cowlY = cfg.cowlYFt !== undefined ? cfg.cowlYFt : 3.4;
    if (kit.blower) { group.add(box(1.6, 1.1, 2.3, dark, 0, cowlY + 0.55, cowlZ)); group.add(box(2.3, 0.5, 1.4, std(0x1a1a1c), 0, cowlY + 1.35, cowlZ - 0.2)); const hat = box(2.6, 0.35, 1.6, chrome, 0, cowlY + 1.75, cowlZ - 0.2); group.add(hat); }
    if (kit.zoomies) for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.4, 8), chrome); p.position.set(sd * 1.7, cowlY - 0.2 + 0.6, cowlZ + 0.6 + i * 0.6); p.rotation.x = -0.95; p.rotation.z = sd * 0.35; group.add(p); }
    if (kit.chutes) { const y = cfg.chuteYFt !== undefined ? cfg.chuteYFt : 2.7; for (const sd of [-1, 1]) group.add(box(0.9, 0.7, 0.9, red, sd * 1.0, y, L / 2 - 0.3)); }
    if (kit.wheelieBar) { for (const sd of [-1, 1]) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.4, 6), dark); bar.position.set(sd * 1.2, 0.9, L / 2 + 1.8); bar.rotation.x = Math.PI / 2 + 0.28; group.add(bar); } for (const sd of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.3, 10), rubber); w.rotation.z = Math.PI / 2; w.position.set(sd * 0.9, 0.28, L / 2 + 3.9); group.add(w); } }
  }

  /* ---------- per-frame ---------- */
  const tmpV = null;
  function render(S) {
    if (!ok) return; const THREE = T(); const W = world;
    setNight(!!S.night); setDistance(S.dist);
    // camera: match the 2D projection (fov from f, principal point via view offset)
    const Wpx = S.W, Hpx = S.H, f = S.f;
    camera.fov = 2 * Math.atan((Hpx / 2) / f) * 180 / Math.PI; camera.aspect = Wpx / Hpx;
    camera.setViewOffset(Wpx, Hpx, Wpx / 2 - S.cx, Hpx / 2 - S.horizon, Wpx, Hpx);
    camera.updateProjectionMatrix();
    const laneX = S.lane * 6.5;
    camera.position.set(laneX, S.camH, -S.camX);
    camera.rotation.set(0, 0, 0); camera.lookAt(laneX, S.camH, -S.camX - 100);
    // sun/clouds follow the camera so they stay at infinity
    W.sunSprite.position.set(laneX + 900, 900, -S.camX - 2000); W.clouds.position.set(laneX, 0, -S.camX); W.stars.position.set(laneX, 0, -S.camX); W.sky.position.set(laneX, 0, -S.camX);
    if (night) { const base = Math.round(S.camX / 120) * 120; pointLights.forEach((pl, i) => { pl.position.set(i === 1 ? 19.5 : -19.5, 40, -(base + (i - 1) * 120)); }); }
    // tree bulbs
    for (const b of treeBulbs) { const st = b.lane === 'left' ? S.tree.left : S.tree.right; const on = !!st[b.key]; const col = b.key === 'green' ? 0x2be35a : b.key === 'red' ? 0xff2a3d : (b.key === 'pre' || b.key === 'stage') ? 0xffd84a : 0xffb000; b.mesh.material.color.setHex(on ? col : (night ? 0x1a1a1d : 0x33343a)); b.glow.visible = on; if (on) b.glow.material.color.setHex(col); }
    // scoreboards
    for (const sd of ['L', 'R']) { const face = boards[sd]; const mine = (sd === 'R') === (S.lane === 1); const sb = mine ? S.board.me : S.board.opp; const key = sb ? sb.et + '|' + sb.mph : '-'; if (lastBoard[sd] !== key) { lastBoard[sd] = key; if (face.material.map) face.material.map.dispose(); face.material.map = canvasTex(256, 140, (c, w, h) => { c.fillStyle = '#0c0c10'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffb000'; c.font = '700 54px Menlo, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(sb && sb.et ? sb.et : '- - -', w / 2, 40); c.fillText(sb && sb.mph ? sb.mph : '- - -', w / 2, 100); }); face.material.needsUpdate = true; } }
    // rival
    const o = S.opp;
    if (o) {
      const x = -S.lane * 6.5, zNose = -o.x;
      car.shadow.visible = true; car.shadow.position.set(x, 0.04, zNose + car.L / 2); car.shadow.scale.set(1, car.L / 18, 1);
      if (car.group && car.status === 'ready') { car.placeholder.visible = false; car.group.position.set(x, 0, zNose + car.L / 2); const dt = S.dt || 0.016; if (o.v !== undefined && car.wheels.length) { const r = (car.spec && car.spec.tireR ? car.spec.tireR : 0.35) / FT; const w = o.v / (r * FT) ; for (const pv of car.wheels) pv.rotation.x -= w * dt; } }
      else { car.placeholder.visible = car.status !== 'failed' && car.status !== 'none'; car.placeholder.position.set(x, 2.1, zNose + car.L / 2); }
    } else { car.shadow.visible = false; car.placeholder.visible = false; if (car.group) car.group.visible = false; }
    if (car.group && o) car.group.visible = true;
    renderer.render(scene, camera);
  }
  // screen position of a world point (for 2D smoke etc.)
  function project(x, y, z, W, H) { const THREE = T(); const v = new THREE.Vector3(x, y, z).project(camera); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, v.z < 1]; }
  function status() {
    if (typeof window === 'undefined' || !window.THREE) return { mode: 'classic', why: 'three.js not found next to index.html (the in-chat demo has no vendor folder)' };
    if (!ok) return { mode: 'classic', why: 'WebGL could not start on this device' };
    const c = car.status === 'ready' ? 'car model loaded' : car.status === 'loading' ? 'loading car model' : car.status === 'failed' ? 'car model missing — models/ folder not found' : 'no car loaded yet';
    return { mode: '3d', why: c };
  }
  function debug() { return { ok, car: { id: car.id, status: car.status, wheels: car.wheels.length, L: car.L }, calls: renderer && renderer.info.render.calls, tris: renderer && renderer.info.render.triangles }; }
  // dev: render from an arbitrary camera (rear three-quarter view of the rival, for orientation checks)
  function debugView(pos, target, W, H) { if (!ok || !car.group) return; camera.clearViewOffset(); camera.fov = 45; camera.aspect = W / H; camera.updateProjectionMatrix(); camera.position.set(pos[0], pos[1], pos[2]); camera.lookAt(target[0], target[1], target[2]); renderer.render(scene, camera); }
  return { init, resize, render, prime, project, debug, debugView, status, get active() { return ok; }, get carStatus() { return car.status; }, get _world() { return world; }, get _scene() { return scene; }, get _camera() { return camera; }, set yaw0(v) { YAW0 = v; } };
})();
