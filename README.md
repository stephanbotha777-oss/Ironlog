# IronLog: offline workout tracker (PWA)

A single-page Progressive Web App for Android. It has no frameworks, needs no server and works fully offline. Your data stays on your phone in localStorage.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell: views, rest-timer bar, bottom tabs |
| `styles.css` | Dark, high-contrast, thumb-friendly UI |
| `app.js` | All logic: program, logger, timer, progression, history, settings |
| `manifest.json` | Makes it installable (name, icons, standalone display) |
| `sw.js` | Service worker that caches everything for offline use |
| `icons/` | 192, 512 and maskable 512 app icons |

## Defaults chosen for you

- **Program:** 4-day Upper/Lower rotation (Upper A Strength → Lower A Strength → Upper B Hypertrophy → Lower B Hypertrophy). The next day comes up whenever you train, so missing a day doesn't break the plan. You can edit everything in Settings → Program.
- **Units:** kg by default. You can switch to lbs any time. Data is stored in kg, so switching never loses precision.
- **Rest timer:** starts when you tick off a set. Defaults are 2:30 for compound lifts and 1:30 for isolation, with −15/+15/Skip controls. When rest ends you get a beep, a vibration and a green screen flash. The screen stays awake during a workout so the timer keeps running. If you lock the phone anyway, the timer catches up when you return.
- **Failed sets:** you log the reps you actually did. A set below the minimum reps turns red.
- **Progression (double progression):**
  - If you hit the top of the rep range on every set, the weight goes up by that exercise's step next time (+2.5 kg upper body, +5 kg lower body, smaller for isolation).
  - If you're within the range, you keep the weight and push for more reps.
  - If you miss reps, you repeat the weight.
  - If you miss reps two sessions in a row, the app deloads 10%.
- **Streak:** counts consecutive weeks where you hit your weekly target (default 4). Rest days never break it.
- **Extras:** PR tracker with estimated 1RM and a sparkline per exercise, body-weight log with a trend chart, and JSON backup export/import.

## Free hosting on GitHub Pages

1. Create a free account at github.com.
2. Tap **+ → New repository**. Name it, for example, `ironlog`, make it **Public** and tap **Create**.
3. Tap **uploading an existing file** and drag in *all* the files, including the `icons` folder. On a phone, the GitHub website upload works too.
4. Commit the files.
5. Go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, pick `main` and `/ (root)`, then tap **Save**.
6. After about a minute your app is live at `https://<your-username>.github.io/ironlog/`.

Other free hosts work the same way: Netlify Drop (drag the folder onto app.netlify.com/drop) and Cloudflare Pages. A PWA needs **HTTPS**, and all of these provide it.

## Install on Android (Chrome)

1. Open your GitHub Pages URL in **Chrome**.
2. Tap the **⋮** menu → **Add to Home screen** → **Install**. You may also see an "Install app" banner, or you can use the button in IronLog's Settings.
3. Launch IronLog from your home screen. It opens full-screen like a native app and works with no signal.

## Updating the app later

Edit the files, then change `VERSION` in `sw.js` (for example `ironlog-v1.0.1`) and upload. Phones get the new version the next time the app is opened twice: the first open downloads it and the second open uses it.

## Back up your data

Data lives in Chrome's storage on the phone. Uninstalling the app or clearing Chrome's site data deletes it. Use **Settings → Export backup** now and then. It saves a `.json` file to Downloads, which **Import backup** restores on any phone.
