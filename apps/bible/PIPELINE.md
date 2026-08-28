# Two pipelines

An external source is used **once**. After that it does not matter what
happens to the URL.

```
                    INTAKE                         MIGRATION
  URL  ──once──►  cache ──► pack  ──────────────►  pack'
                  (gitignored)  (committed)         (committed)
```

These are independent. Intake never reads a pack except to see that it
already exists. Migration never fetches, never opens cache, never parses
USFX or TSK.

## 1. Intake

External bytes → our pack. Runs when there is **no pack yet**.

`--reintake` is not a refresh. It is the hatch for a botched intake: we
dropped something the pack no longer contains, and a migration cannot
invent it. Only then do we go back to the original source. If the URL is
gone too, that loss is permanent.

```
node apps/bible/tools/fetch-texts.mjs --only engwebp
node apps/bible/tools/build-packs.mjs --only engwebp

node apps/bible/tools/fetch-helps.mjs
node apps/bible/tools/build-helps.mjs --only xrefs
```

If `site/apps/bible/packs/help-xrefs.gbx` is already there, those commands
print `sealed` and do nothing. They do not hit GitHub or CrossWire.

Do not `--reintake` because a nicer TSV appeared, or because we want to
“rebuild.” Rebuilds are migrations.

## 2. Migration

Pack → pack. Named functions in `tools/migrate-packs.mjs`. The rewrite is
the committed file. Upstream is not a parameter.

```
node apps/bible/tools/migrate-packs.mjs --check
node apps/bible/tools/migrate-packs.mjs --only help-xrefs.gbx
```

## Why this split

- Clone and CI need no network and no `.cache/`.
- A CrossWire 404 next year does not change Treasury.
- A pack-format change cannot accidentally re-parse a live TSV that drifted.
- Intake bugs and migration bugs do not share a code path.
