# Worldview

Every picture in this app is a real satellite image of the Earth, taken by a
NASA instrument on the day you are looking at. Most of it is less than three
hours old; the archive goes back to 2000 for true colour and 1981 for sea
surface temperature.

## Moving around

- **Drag** to pan, **scroll** or **pinch** to zoom, **double-click or
  double-tap** to zoom in.
- **Search** any of 1,240 places by name — it works with no connection. You can
  also type coordinates like `51.5, -0.12`.
- **Whole Earth** (the globe button) puts the planet back in the frame.
- Keyboard: arrow keys pan, `+` and `-` zoom, `/` jumps to search.

## Layers

**Layers** (top left) is the stack, painted bottom to top exactly as it is
listed — the top row is the thing you see first.

- The **eye** hides a layer without removing it; the **trash** removes it.
- Tap a layer's name to open it: an **opacity** slider, what the layer is, and
  its legend.
- **Drag the dotted handle** to reorder. An overlay under an opaque base layer
  is invisible — that is usually what has happened when a layer "does nothing".
- **Add layers** opens the catalogue: 74 layers, grouped the way NASA groups
  them, with a search box. Try `fire`, `ice`, `aerosol`, `night`,
  `temperature`, `chlorophyll`.
- Five layers live inside this app and need no connection at all: **Blue
  Marble**, **Coastlines**, **Borders**, **Place labels** and the
  **Graticule**. Blue Marble sits under everything and is what fills the gaps
  between satellite passes.

Some layers only exist on some days — a night-time layer over the pole, an
instrument that launched in 2018, a composite published every eight days. When
that is the case the layer row says so instead of showing you an empty map.

## Time

- The **timeline** at the bottom is a ruler: drag it to scrub the date, scroll
  on it to zoom from days out to decades, hold **Shift** and drag to slide the
  window without changing the day.
- The **arrows** either side of the date step one day. `,` and `.` do the same
  from the keyboard.
- Tap the **date** to pick one, or jump to a week, a month or a year ago.
- Layers that update every ten or thirty minutes add a **time of day** slider.

## Animation

**Animate…** sets a range and a speed, then **Play** runs it. Each frame waits
until its imagery has arrived, so an animation plays smoothly instead of
flickering.

**Save as a GIF** writes the animation here on your device — every frame
stamped with its date — and hands you the file. Nothing is uploaded and there
is no queue.

## Comparing two days

The **A/B button** splits the screen: the day you are on down one side, another
day down the other, with a handle to drag between them. Tap either date tag to
change it. It is the fastest way to see a fire scar, a flood, a melt or a
harvest.

## Measuring, pictures and saved views

- **Measure** — tap points on the map for a running distance.
- **Save this view** takes a picture of exactly what is on screen, with the
  date and credit printed on it if you want them.
- **Saved views** keeps a place, a day and the whole layer stack under a name.
  Saved views live inside this file, so they travel with it.

## Working offline

The app never needs a connection to open. With one, imagery arrives and is kept
here as you look at it; without one, you get the Blue Marble base, the
coastlines, the labels, and every tile you have already seen.

**Offline & storage** (bottom of the Layers panel) shows how much imagery is
kept in this file, lets you **pin this view** — download everything on screen at
this zoom and one closer, so it survives a flight — and empties the cache when
you want the space back.

## Credit

Imagery: NASA EOSDIS Global Imagery Browse Services (GIBS), the archive behind
NASA Worldview at worldview.earthdata.nasa.gov. Coastlines, borders and place
names: Natural Earth. This app is an independent port and is not endorsed by
NASA.
