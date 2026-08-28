# Text pipeline — freeze, then migrate the pack

Upstream URLs go away. The **committed pack** (`site/apps/bible/packs/*.gbp` /
`*.gbx`) is the text we ship. Cache under `apps/bible/.cache/` is a rebuild
convenience and is gitignored.

## Steps

1. **List** — eBible CSV (filtered), or a handwritten row in `credits.json` /
   `getbible-vetted.json`.
2. **Copy** — `fetch-texts.mjs` / `fetch-helps.mjs` pull the URL into cache.
   If the URL 404s, keep the last cache. If cache is gone too, **keep the pack**.
3. **Convert** — `build-packs.mjs`, `build-helps.mjs`, … write the pack.
   They never delete the packs directory. Missing source + existing pack =
   skip that file (`FROZEN` in the log).
4. **Seal** — Bible pins the pack; Study bakes it into the GIF.

If the *format* of a pack has to change and the URL is dead, do not hunt a
mirror. Add a named function to `tools/migrate-packs.mjs` and rewrite the
pack on disk.

```
node apps/bible/tools/fetch-texts.mjs
node apps/bible/tools/fetch-helps.mjs
node apps/bible/tools/build-packs.mjs --only engwebp
node apps/bible/tools/migrate-packs.mjs --check
```
