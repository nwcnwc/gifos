# Nullboard

A compact kanban. The board is the file. Send the invite and a friend
lands on the same lists — no Trello account.

An unofficial port of **[Nullboard](https://github.com/apankrat/nullboard)**
by Alexander Pankratov (2-clause BSD with the Commons Clause). This directory
is the GifOS shell: a classic-script wrapper, `gifos.db` instead of the page's
storage, tap menus, and the invite room. Upstream is a single HTML file.

```
index.html
style.css
ls-stub.js                 memory localStorage → gifos.db
boot.js                    hydrate, start, Back
mp.js                      optional meeting: same board
touch.js                   tap ≡, phone bar, pointer drag
vendor/nullboard.js        upstream, init wrapped as startNullboard
vendor/nullboard.css       upstream + Barlow as data URLs
vendor/jquery-3.6.0.min.js pinned, MIT
icon.mjs                   sticker: a card sliding Done
build.mjs                  packs site/apps/nullboard/nullboard.gif
```

## Why this can run as a GifOS app

Upstream is one page, jQuery, Barlow, and localStorage. The sandbox has no
localStorage and no network, so the store is a memory facade that dumps into
`gifos.db`, Barlow rides as a data URL, and the jQuery CDN fallback is gone.
Auto-backup to a Nullboard Agent is not in this copy: the file is the save.

## capabilities

| capability | why |
|---|---|
| `db` | Boards in a `private` collection; the meeting copy in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome. |
| `links` | `https://` in a note, and the Nullboard.io links in About. |

`minBuild` is **2154** (`capabilities.links`).

## Building

```bash
node apps/nullboard/build.mjs   # -> site/apps/nullboard/nullboard.gif
```

## Licence

2-clause BSD with the Commons Clause, Alexander Pankratov. The notice is
packed **inside the GIF** as `COPYING.txt`. Barlow is SIL OFL 1.1; jQuery
3.6.0 is MIT. Redistribute this app only as the license allows — do not sell it.
