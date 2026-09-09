# Bible Study — a listing, not a source tree

The source lives in **nwcnwc/offline-bible-study**, and so does the artifact:
the GIF is built, tested and signed there, published as a GitHub Release, and
copied from that release to the address `listing.json` pins. Nothing here
builds anything; this directory is the store's copy of the app's own
`manifest.json`, `listing.json`, `help.md` and cover.

At half a gigabyte the GIF cannot live in this repo — that is what `gifUrl`
is for. The bytes are served from the study site's R2 bucket
(`https://biblestudy.gifos.app/gifos/offline-bible-study/<tag>.gif`), which,
unlike a GitHub Release asset, answers with `Access-Control-Allow-Origin` so
the browser can `fetch` it, honours `Range` so a dropped connection resumes,
and caches immutably because the tag is in the path.

The catalog still pins the bytes: `gifSha256` and `gifBytes` here, checked on
every build against what that URL actually serves, and `credits.json` inside
the GIF must equal what `scripts/app-credits.mjs` derives from this listing.

**To update:** copy `manifest.json`, `listing.json` (with `gifUrl` set to the
new tag's hosted address), `help.md` and `screenshot.png` from the app repo's
`app/`, then `node scripts/build-app-catalog.mjs`.

Capabilities it uses: `db`, `multiplayer`, `microphone`, `wasm`, `ai: [tts]`,
`links`. Minimum build: see `manifest.json`.
