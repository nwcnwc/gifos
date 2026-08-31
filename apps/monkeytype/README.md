# Monkeytype

A faithful typing test as a sandboxed GifOS app: words and quotes, WPM / accuracy,
themes that use system fonts, personal bests in `gifos.db`, and a live race from
one invite. Unofficial port of [Monkeytype](https://github.com/monkeytypegame/monkeytype)
(Miodec, GPL-3.0).

The huge React frontend is not shipped. This directory recreates the **test**.

```
index.html      chrome, words, result, race lobby, command line
style.css       serika-dark variables; themes swap the variables
engine.js       word gen, punctuation, quotes, key handling, WPM / acc
net.js          race — each racer writes their own row; host writes the seed
app.js          UI, history, themes, command line
vendor/data.js  english + english 1k + 82 quotes, pinned from upstream
vendor/COPYING.txt  GNU GPL-3.0 (rides inside the GIF)
icon.mjs        caret typing "the lazy", then 87 wpm
tools/shoot.js  Playwright mid-test screenshot.png (real window)
build.mjs       packs site/apps/monkeytype/monkeytype.gif + cover.jpg
```

## Why this can run as a GifOS app

Upstream is an account site with hundreds of languages, webfonts, and a
backend. The sandbox has no network and no localStorage. Word lists and a
quote subset ride in the GIF. History is a private collection. A race is the
same seed on every client, live rows in `players`.

## capabilities

| capability | why |
|---|---|
| `db` | Personal bests / theme / history in `prefs` (private). Race seed in `match`. Live bars in `players`. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
python3 -m http.server 18765 -d apps/monkeytype
node apps/monkeytype/tools/shoot.js   # screenshot.png from the live window
node apps/monkeytype/build.mjs        # -> site/apps/monkeytype/{monkeytype.gif,cover.jpg}
```

## Licence

GPL-3.0, Miodec / monkeytype contributors. The notice is packed **inside the
GIF** as `COPYING.txt`. Word lists and quotes are from the pinned upstream
commit in `vendor/UPSTREAM.txt`.
