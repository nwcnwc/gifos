# Hex Chess

Gliński's hexagonal chess, written here as classic scripts. Not a wrap of
boardgame.io, not the square board in Chess Grandmaster.

The computer thinks on this device. One invite is a friend on the other
colour. The file is the save.

```
index.html     setup / local game / play a friend
style.css      dark #0a0a0f, gold accents
board.js       91-hex Gliński rules, check / mate / stalemate, AI
app.js         tap-piece tap-hex, seats, multiplayer
icon.mjs       hex-grid icon (a knight leaping) + 1200×720 cover
build.mjs      packs the GIF into site/apps/hex-chess/hex-chess.gif
```

## Coordinate system

Cube / axial: a hex is `(q, r)` with `s = −q−r` and `max(|q|, |r|, |s|) ≤ 5`
(radius 5 → 91 hexes). `q` is the file:

```
q  -5 -4 -3 -2 -1  0  1  2  3  4  5
   a  b  c  d  e  f  g  h  i  k  l     (j skipped)
```

Rank 1 is the south end of a file (`r = rMin(q)`), rank grows north. File `f`
has 11 hexes (`f1`…`f11`); files `a` and `l` have 6. Ranks are V-shaped and
bend 60° at the f-file, which is the official Gliński notation.

Pixel (flat-top, north up):

```
x = size · √3/2 · q
y = −size · (r + q/2)
```

Colour of a hex is `(q − r) mod 3`. Centre `f6` is mid-tone.

## Variant rules (Gliński)

Starting array (White / Black):

```
K  g1 / g10
Q  e1 / e10
R  c1, i1 / c8, i8
N  d1, h1 / d9, h9
B  f1, f2, f3 / f9, f10, f11     (one bishop per colour)
P  b1 c2 d3 e4 f5 g4 h3 i2 k1
   b7 c7 d7 e7 f7 g7 h7 i7 k7
```

Each side 18: king, queen, 2 rooks, 2 knights, 3 bishops, 9 pawns.

- **Rook** — any distance orthogonally (through edges). Six directions.
- **Bishop** — any distance diagonally (through vertices). Colour-bound; the
  three bishops never share a colour and never defend each other.
- **Queen** — rook + bishop.
- **King** — one hex orthogonally or diagonally (12 neighbours in the centre).
  **No castling.**
- **Knight** — two hexes orthogonally, then one orthogonal at 60° (a leap).
  Cube delta is a permutation of `(3, −2, −1)`. Mid-board a knight has 12
  landings.
- **Pawn** — one hex vertically forward (White `+r`, Black `−r`). Captures one
  hex orthogonally forward at 60° (not a bishop step). Double step from any
  friendly pawn-start hex. **En passant** is in. Promotion on the far end of
  any file (White: `r = rMax(q)`; Black: `r = rMin(q)` — eleven hexes, the
  opposite three edges of the hexagon).

Check, checkmate, stalemate. Stalemate is not a FIDE draw: the side that
delivered it scores (Gliński's ¾ / ¼, shown here as a stalemate win for
the deliverer).

## What we skipped

- Tournament ¾–¼ *scoring numbers* (the result is labelled stalemate, and
  the deliverer is the winner of the game).
- Threefold repetition and the 50-move rule.
- Castling (the variant has none — not skipped, absent).

## Modes

- **Computer** — legal-move generator plus a shallow capture-preferring eval
  on a timeout. It never cheats (every pick is from `legalMoves`) and it
  never blocks the UI (`setTimeout`).
- **Two here** — pass the device. White goes first. Tap a piece, then a hex.
- **Play a friend** — send the invite (top bar; that button is OS chrome).
  Each person writes only their own row. The host of the board (lowest live
  id) is the only writer of the board row: a player publishes an intended
  move, the host applies it if it is legal.

## capabilities

| capability | why |
|---|---|
| `db` | Saved local game, and the shared board. |
| `multiplayer` | The room. |

No `wasm` (do not ship Stockfish). No `network`. `minBuild` is **947**.

## Building

```bash
node apps/hex-chess/build.mjs
```

Writes `site/apps/hex-chess/hex-chess.gif`. Do not run
`scripts/build-app-catalog.mjs` from this change — `index.json` is owned
elsewhere.

## Licence

MIT. First-party; rules by Władysław Gliński (1936), public.
