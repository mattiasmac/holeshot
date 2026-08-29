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
3. **Tree** — keep holding LAUNCH. The engine sits on the two-step at your launch RPM. When both cars are staged, the autostart fires the tree at a random moment. **Let go on the last amber** — letting go is the launch: the car needs real rollout time to clear the beam, so releasing on green is late and releasing early is a red light. Street cars run the sportsman tree (ambers count down .500 apart); the pro cars run the pro tree (all three ambers at once, green .400 later). Settings lets you force either.
4. **Shift** — the tach shows a green window for each gear. Perfect shifts pay; early ones bog, late ones bounce off the limiter. Auto mode shifts for you at ×0.8 points.
5. **Wheelspin** — if the tach flares and the car doesn't move, hold PEDAL to lift off the gas for a moment. Lower the launch RPM in the garage if it keeps happening; raise it if the car bogs.

The timeslip after every pass shows R/T, 60', 330', 660' with speed, 1000', ET and trap speed for both lanes, the margin, a holeshot flag, and the points breakdown.

**Modes:** Quick race (Rookie / Pro / Elite rivals), Bracket race (dial-in with a real handicap start and breakouts), Tournament ladder (three rounds, payout doubles), Reaction drill (five trees, 60-foot dashes), Beat the clock (solo, target from your dyno). **Garage:** 11 cars from a Civic Type R to a Top Fuel dragster, five upgrade categories, launch-RPM tuning with the dyno's recommendation. **Challenges:** 15 with point rewards. **Leaderboard:** quickest quarter-mile and 1,000-ft ETs plus best reaction times — shared between everyone when it runs inside Claude, per-device when installed (host it with your own backend to share; the storage adapter is `Store` at the top of the script).

## What's real about it

- **Timing system:** stage-beam rollout (11.5 in shallow, 4 in deep), reaction time measured from the green (.000 perfect, negative = red), incremental beams at 60/330/660/1000/1320 ft, trap speed averaged over the last 66 ft, half-track speed, holeshot wins, first-to-foul rules, bracket handicaps and breakouts. Nitro cars run 1,000 ft as they have since 2008.
- **Physics:** per-car torque curves scaled to real horsepower, real gear ratios (Tremec 6-speed, GT-R DCT, ZF 8-speed, Liberty clutchless 5-speed), final drives, tire diameters and growth, drivetrain loss, aero drag, downforce, weight transfer solved implicitly at the grip limit, wheelie bars, converter multiplication for automatics, clutch/converter slip on the launch, torque-converter and clutch-slip time constants, shift cut times (clutchless 50 ms vs H-pattern 300 ms), rev-limiter fuel cut, tire temperature, and the pedal-to-hook mechanic.
- **Calibration:** every car was simulated and tuned to its real-world reference before the game code was written. Stock, warm tires, perfect driver: Civic Type R 13.2 @ 106, Mustang GT 12.24 @ 114, GT-R 10.8 @ 124, Hellcat 11.2 @ 129, Z06 10.4 @ 132, Plaid 9.24 @ 152, Demon 170 8.88 @ 151 (NHRA-certified 8.91 @ 151), Pro Stock 6.55 @ 212 with a 1.01 60-ft (real: 6.5 @ 212, ~1.0), Pro Mod 5.5 @ 247, Funny Car 3.83 @ 333, Top Fuel 3.68 @ 333 with an 0.83 60-ft (real: 3.68 @ 335, 0.83).
- **Sound:** synthesized in Web Audio from the firing frequency (rpm/60 × cylinders/2) with per-engine voicing — inline-four, V6, cross-plane V8, supercharged V8, flat-plane V8, 500-inch Pro Stock, blown Pro Mod, nitro — plus the limiter stutter, two-step chatter, air-shifter hiss and tire chirp. No audio files.

## Files

- `index.html` — the whole game (physics, renderer, audio, UI, storage).
- `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — the Home Screen install.
- `source/` — the same code split into modules plus the Node test harness (`tune.js` prints every car's simulated timeslip against its real target; `test_race.js` and `test_drill.js` drive full races headlessly).

To change a car or add one, edit the `CARS` table near the top of the script (`10_physics.js` in `source/`), then run `node tune.js` to see its simulated splits.
