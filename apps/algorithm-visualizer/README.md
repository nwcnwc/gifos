# Algorithm Visualizer

An unofficial GifOS port of
[Algorithm Visualizer](https://github.com/algorithm-visualizer/algorithm-visualizer)
(Jinseo Jason Park, MIT, ~48k stars). The original is a React app plus a
compile server that runs JavaScript / C++ / Java. This copy is the tracer
player only: a curated set of algorithms emit the same command stream
(`Array1DTracer`, `ChartTracer`, `GraphTracer`, `LogTracer`, `Array2DTracer`)
and play offline.

```
index.html      catalog, stage, input, player chrome
style.css       dark IDE surface (select blue, patch magenta)
tracer.js       command recorder — the tracers.js API
algos.js        19 walk-throughs (sort, search, graph, DP, backtracking)
render.js       DOM/SVG renderers for each tracer kind
player.js       play / pause / step / seek
net.js          follow-along: host writes session, guests rebuild the trace
boot.js         gifos.db save, launch.algo, guest lock
icon.mjs        bars that swap, and the 1200×720 cover
build.mjs       packs site/apps/algorithm-visualizer/algorithm-visualizer.gif
```

## Why this can run as a GifOS app

The website needed a server to compile code and GitHub sign-in. The sandbox
has no network (`connect-src 'none'`). Algorithms here are functions that
call the tracer API at record time; playback is applying those commands.
Quality of a sort on 12 numbers beats shipping the whole catalog of C++
files that could never compile.

## capabilities

| capability | why |
|---|---|
| `db` | Last algorithm + input in a `private` `save`. Host playback in a `read-only` `session`. Presence in `players`. |
| `multiplayer` | Invite is follow-along. Guests see the host's cursor; they do not pick the algorithm. |

`launch.algo` opens onto an id (`bubble-sort`, `dijkstra`, …). `minBuild` is
**947** — nothing newer than the store.

## Building

```bash
node apps/algorithm-visualizer/build.mjs
```

## Licence

MIT, Jinseo Jason Park. The notice is packed **inside the GIF** as
`COPYING-algorithm-visualizer.txt`.
