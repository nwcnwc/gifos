# A Dark Room — gauntlet

**Win:** Close the tab, still stoking; invite someone, they sit at the same fire; a phone can play it.

Bar ONE: http://adarkroom.doublespeakgames.com/ — the original text incremental. White page, localStorage, phones bounced to an app-store splash, audio fetched from the host.

Bar TWO: the fire and the village live in the GIF; close the tab, still stoking; optional invite is a shared fire.

## Rounds

1. Vendor MPL-2.0 tree at `1fada46`. Replace localStorage with a memory shim hydrated from the save collection. Rewrite `$SM` eval-walk so the sandbox CSP does not kill the store.
2. Pack FLAC as `.assets/audio/*` and decode through Web Audio — no network fetch.
3. Default dark. Phone reflow: log above the room, 36px buttons, D-pad on the map.
4. Shared fire: host publishes State; guests send button clicks; both see the same woodpile.
5. Icon is the fire growing in a dark room. Cover is a roaring fire, a hut going up, stores of wood.

## Remaining gap

World-map letter grid is still dense on a very small phone; the D-pad walks it, but a zoomed viewport around `@` would read faster.
