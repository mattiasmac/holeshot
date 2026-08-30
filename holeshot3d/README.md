# HOLESHOT — Pro Drag Racing

First-person drag racing on a sanctioned quarter-mile, built as a single HTML5 file that runs in any browser and installs on an iPhone as a Home Screen app. No frameworks, no assets to load, no network needed to play.

## Play it right now

Open `index.html`. On a desktop browser: **Space** = launch/burnout/lift (hold and release), **Shift / Enter / ↑ / S** = shift. On a phone the two thumb buttons do the same thing.

## Put it on your iPhone

### Option A — Home Screen app (no Mac, no developer account, ~5 minutes)

iOS installs web apps straight from Safari. The app needs to be served from an `https://` address (a plain file won't do), and GitHub Pages is free:

1. Create a new public GitHub repository (e.g. `holeshot`), upload everything in this folder (`index.html`, `manifest.json`, `sw.js`, the three `.png` icons).
2. Repository **Settings → Pages → Source: Deploy from a branch → main / (root)**. Wait a minute and GitHub gives you a URL like `https://<you>.github.io/holeshot/`.
3. Open that URL in **Safari** on the iPhone (must be Safari, not Chrome).
4. Tap the **Share** button → **Add to Home Screen** → **Add**.

It now launches full-screen from its own icon, keeps your progress, and the service worker caches it so it opens offline. Any static host works the same way (Netlify, Cloudflare Pages, Vercel, your own server) — GitHub Pages is just the quickest.

Quick LAN test without hosting: on a Mac in this folder run `python3 -m http.server 8000`, then open `http://<mac-ip>:8000/` on the phone. You can play and even add it to the Home Screen, but iOS treats an `http://` LAN address as insecure, so the offline cache won't register — use Option A for the real install.

### Option B — Native app for TestFlight / the App Store (Mac + Xcode)

Wrap the same files with Capacitor. You need a Mac with Xcode, and an Apple Developer Program membership ($99/yr) for TestFlight or the App Store. Free provisioning lets you install on your own phone for 7 days at a time without paying.

```bash
mkdir holeshot-ios && cd holeshot-ios
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/haptics
npx cap init Holeshot com.yourname.holeshot --web-dir www
mkdir www && cp /path/to/holeshot/* www/
npx cap add ios
npx cap open ios        # opens Xcode: pick your Team under Signing & Capabilities, then Run
```

Before submitting to the App Store, add a little native behaviour so it doesn't read as a plain web wrapper (Guideline 4.2): the `@capacitor/haptics` plugin is already installed above — call `Haptics.impact()` on the green light and on perfect shifts (search for `Sfx.winHorn` and `onShift` in `index.html` for the right spots), keep the offline cache, and consider Game Center for the leaderboard. Set the Xcode project to allow landscape and portrait.

## Sound on iPhone

iOS mutes Web Audio whenever the ring/silent switch (or Action button) is set to silent, because it treats synthesized audio as "ambient". The game works around this the way music sites do: on your first tap it starts a silent looping audio track, which makes iOS treat the page as media playback, and the engine sound follows. If you still hear nothing, tap once anywhere (audio can only start from a tap), check that Sound is On in Settings, and nudge the volume up with the side buttons while the game is open — iOS keeps a separate volume for media.

## How to race

1. **Burnout** — hold BURNOUT to heat the tires; release when the bar is green. Greasy (red) is worse than cold.
2. **Stage** — press STAGE and keep your thumb down; the car creeps into the beams. Pre-stage bulb, then stage bulb. Deep staging (Settings) rolls further in: quicker reaction time, slower ET, easier to red-light — exactly like the real thing.
3. **Tree** — keep holding LAUNCH. The engine sits on the two-step at your launch RPM. When both cars are staged, the autostart fires the tree at a random moment. **Let go on the last amber** — letting go is the launch: the car needs real rollout time to clear the beam, so releasing on green is late and releasing early is a red light. Pro tree (.400) or Sportsman tree (.500) in Settings.
4. **Shift** — the tach shows a green window for each gear. Perfect shifts pay; early ones bog, late ones bounce off the limiter. Auto mode shifts for you at ×0.8 points.
5. **Wheelspin** — if the tach flares and the car doesn't move, hold PEDAL to lift off the gas for a moment. Lower the launch RPM in the garage if it keeps happening; raise it if the car bogs.

The timeslip after every pass shows R/T, 60', 330', 660' with speed, 1000', ET and trap speed for both lanes, the margin, a holeshot flag, and the points breakdown.

**Modes:** Quick race (Rookie / Pro / Elite rivals), Bracket race (dial-in with a real handicap start and breakouts), Tournament ladder (three rounds, payout doubles), Reaction drill (five trees, 60-foot dashes), Beat the clock (solo, target from your dyno). **Garage:** 11 cars from a Civic Type R to a Top Fuel dragster, five upgrade categories, launch-RPM tuning with the dyno's recommendation. **Challenges:** 15 with point rewards. **Leaderboard:** quickest quarter-mile and 1,000-ft ETs plus best reaction times — shared between everyone when it runs inside Claude, per-device when installed (host it with your own backend to share; the storage adapter is `Store` at the top of the script).

## What's real about it

- **Timing system:** stage-beam rollout (11.5 in shallow, 4 in deep), reaction time measured from the green (.000 perfect, negative = red), incremental beams at 60/330/660/1000/1320 ft, trap speed averaged over the last 66 ft, half-track speed, holeshot wins, first-to-foul rules, bracket handicaps and breakouts. Nitro cars run 1,000 ft as they have since 2008.
- **Physics:** per-car torque curves scaled to real horsepower, real gear ratios (Tremec 6-speed, GT-R DCT, ZF 8-speed, Liberty clutchless 5-speed), final drives, tire diameters and growth, drivetrain loss, aero drag, downforce, weight transfer solved implicitly at the grip limit, wheelie bars, converter multiplication for automatics, clutch/converter slip on the launch, torque-converter and clutch-slip time constants, shift cut times (clutchless 50 ms vs H-pattern 300 ms), rev-limiter fuel cut, tire temperature, and the pedal-to-hook mechanic.
- **Calibration:** every car was simulated and tuned to its real-world reference before the game code was written. Stock, warm tires, perfect driver: Civic Type R 13.2 @ 106, Mustang GT 12.24 @ 114, GT-R 10.8 @ 124, Hellcat 11.2 @ 129, Z06 10.4 @ 132, Plaid 9.24 @ 152, Demon 170 8.88 @ 151 (NHRA-certified 8.91 @ 151), Pro Stock 6.55 @ 212 with a 1.01 60-ft (real: 6.5 @ 212, ~1.0), Pro Mod 5.5 @ 247, Funny Car 3.83 @ 333, Top Fuel 3.68 @ 333 with an 0.83 60-ft (real: 3.68 @ 335, 0.83).
- **Sound:** synthesized in Web Audio from the firing frequency (rpm/60 × cylinders/2) with per-engine voicing — inline-four, V6, cross-plane V8, supercharged V8, flat-plane V8, 500-inch Pro Stock, blown Pro Mod, nitro — plus the limiter stutter, two-step chatter, air-shifter hiss and tire chirp. No audio files.

## 3D mode

With `vendor/three.min.js` and the `models/` folder in place (they're in the repo), the game renders the whole strip in WebGL: textured track and launch pad, walls and sponsor panels, grandstands with an instanced crowd, tower, light poles with real lights at night, cones and photocells, distance boards, scoreboards, the Christmas tree with glowing bulbs, sky, sun, clouds, stars and fog — and the rival is the real glTF model of your car, placed with the tuning in `models/cars.json` (rotation, scale to real length, prop trimming, wheel grounding, glass, running-gear kit). The 2D layer draws only cockpit, HUD and smoke on top. If three.js or a model is missing (the in-chat demo, for instance) it falls back to the drawn world automatically, and Settings → Graphics lets you choose Classic on purpose.

The renderer lives in `source/35_gl.js`. `source/gltest.html` + `source/glshot.js` render any car/scene to PNG through headless Chrome (`npm i @sparticuz/chromium puppeteer-core`, then `sh run_gl.sh glshot.js 390 844 '<shots json>' /tmp/out`), and `source/play.js` plays a whole race in the real `index.html` and screenshots it. Model credits are in `CREDITS.md`.

Next steps on the plan: your own car in 3D (hood from the same model at seat height, per-class cockpits, wheelie pitch, chutes, a mirror render), then paint reflections, night emissives, 3D smoke and heat shimmer.

## Graphics and how to make them more real

The scene is drawn live on a 2D canvas — no image files — which is why the game is a single file that runs anywhere. Every car has its own rear-view body (Mustang tri-bar taillights, Hellcat light bar, Pro Stock wing and wheelie bars, Funny Car injector hat, Top Fuel rail with zoomies and rear wing), the track has a textured surface that streams past, a rubbered groove, a concrete launch pad, timing blocks, scoreboards, grandstands with a crowd, a tower and light poles, and the cockpit has A-pillars, a mirror that shows the rival when it's behind you, and a hood or scoop or dragster rails depending on the car.

Two ways to push it further:

1. **Drop in real images.** The renderer looks for optional files and uses them automatically when present:
   - `assets/car/<id>.png` — the rival car from directly behind, transparent background, the ground contact at the bottom edge of the image, ~1000 px wide. Ids: `ctr`, `gt`, `gtr`, `hellcat`, `z06`, `plaid`, `demon`, `prostock`, `promod`, `funny`, `topfuel`.
   - `assets/hood/<id>.png` — your own hood/cowl as seen from the driver's seat (transparent above the hood line), ~1200×500 px.
   Missing files just fall back to the drawn version. Photograph or render them yourself, or use images you have the rights to.
2. **Move the renderer to 3D.** Physics, timing, sound and progression are independent of the renderer (`R` in the source), so a three.js scene with glTF car models can replace the drawing code without touching the race logic.

## Files

Everything the game needs is in this folder — upload it as-is and it runs:

- `index.html` — the game. `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — the Home Screen install.
- `vendor/three.min.js` — three.js r185 with the glTF + meshopt loaders (3D mode).
- `models/cars.json` + `models/<id>.glb` — the eleven car models and their tuning (3D mode). Keep `cars.json` from this folder: its yaw values are the verified ones.
- `assets/` — optional real images for the Classic renderer.
- `source/` — the same code split into modules, the build script, and the test tools.

### Original file list

- `index.html` — the whole game (physics, renderer, audio, UI, storage).
- `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — the Home Screen install.
- `source/` — the same code split into modules plus the Node test harness (`tune.js` prints every car's simulated timeslip against its real target; `test_race.js` and `test_drill.js` drive full races headlessly).

To change a car or add one, edit the `CARS` table near the top of the script (`10_physics.js` in `source/`), then run `node tune.js` to see its simulated splits.
