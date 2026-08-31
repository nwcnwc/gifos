# Carbon gauntlet

**Win:** A stranger who knows carbon.now.sh uses this one because there is no account, the snippet and theme live in the file, export is a PNG from here, and one Invite lets a friend type on the same image.

## Bars

- **ONE:** [carbon.now.sh](https://carbon.now.sh) / [ray.so](https://ray.so) — the window, Seti, the grey field, traffic lights, theme/language/background, PNG.
- **TWO:** no account; snippet+theme persist in the GIF; PNG from the sandbox; Invite edits the same snippet.

## Pieces

| piece | bar | status |
|---|---|---|
| ICON | reads as a code window at 64px; animation types syntax bars | in |
| STORE ART | mid-use Seti + pluckDeep on the grey field | in |
| LISTING COPY | leads with no-account / file-is-the-save / invite | in |
| Window chrome | traffic lights, Seti default, grey bg, padding, shadow | in |
| Themes | Carbon's own tables from constants.js | in |
| Export PNG | canvas at 1×/2×/4×, copy PNG, keep recents | in |
| Recents + persist | gifos.db save + recents | in |
| Invite | read-write room, last write wins | in |

## Rounds

1. First build: themes vendored, tokenizer, Carbon chrome, PNG export, recents, invite.
2. Cover and icon judged against carbon.now.sh's own grey Seti shot — default snippet, not an empty boot.
3. Phone: toolbar wraps, stage scales the window, settings/recents are a sheet, Back closes the sheet.

## Remaining gap

Upstream's CodeMirror (70+ modes, per-range bold/italic marks, Hack/Fira webfonts) is not in the sandbox; highlighting is a local tokenizer on Carbon's own theme keys, and the PNG is drawn in the system mono.
