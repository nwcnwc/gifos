# Mermaid

An unofficial wrap of **[mermaid](https://github.com/mermaid-js/mermaid)**
(MIT) by mermaid-js: vendored IIFE + textarea + live SVG preview. Not
the SvelteKit live editor. The diagram lives in the file.

![screenshot](screenshot.png)

## capabilities

`db` + `multiplayer`. `minBuild` **947**. No network.

```bash
node apps/mermaid/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.

Pinned mermaid **10.9.8** UMD (`dist/mermaid.min.js`).
