# Bible app — live progress note

Gauntlet-loop build of a new App Store app: `apps/bible/`.

## Hard constraints
- **Public-domain texts only.** A translation enters the catalog only where
  eBible.org's own rights metadata says `Copyright: public domain` and
  `Redistributable: True`. 1550 rows scanned, 1439 refused, 111 kept, 3 dropped
  by hand with the reason recorded. No modern copyrighted translation ships.
- Platform walls (apps/README.md, site/llms.txt): everything vendored inside
  the GIF or on a manifest asset pin; data only in gifos.db; no CDN.

## Done
- Source survey — eBible.org, 1550 rows; getbible second shelf
- `tools/catalog.mjs` — the public-domain filter -> `data/ebible-pd.json`
- `data/books.json` — 86 USFM book codes, canon + deuterocanon
- `tools/usfx.mjs` — USFX -> paragraphs, poetry lines, words of Christ,
  translators' footnotes, cross-references, section headings, NATIVE book names
- `tools/build-packs.mjs` — GBP2 packs, 139 texts, 63 languages
- `tools/source.mjs` + `PIPELINE.md` — intake once (URL → pack); after
  that only `migrate-packs.mjs` rewrites a pack. `--reintake` is the
  explicit second intake of the same id.
- `js/pack.js` — the reader's pack reader (native DecompressionStream)
- `test/unit/bible-pack.js` — 9 assertions, green
- `js/versify.js` + `test/unit/bible-versify.js` — three traditions mapped
- Reader shell: columns, sheets, marks, plans, voice, search, invite cursor
- Study apparatus: TSK, Matthew Henry, Easton, Smith, Nave, Torrey, OpenBible
  gazetteer, M'Cheyne + two computed plans, Strong's H/G, WLC + Byzantine +
  Tischendorf interlinears. Packs are optional pins; the reader loads them
  the first time a verse is studied.
- `test/unit/bible-helps.js`, `bible-lexicon.js`, `bible-apparatus.js`,
  `bible-refs.js` — green

## Versification is a first-class problem
Chapter and verse divisions are not universal, and a parallel reading silently
misaligns if nobody looks. 93 packs count the English way, 9 the Greek way
(Psalms 9-10 merged, so the Psalter runs one lower and there is a Psalm 151),
6 the Hebrew way (Joel in four chapters). Each pack records which. The reader
maps between them and says so when a reference cannot cross exactly.

## Next
- Boot the GIF in the real sandbox, take the store cover from a real capture
- listing.json; sign; catalog
- Gauntlet rounds against YouVersion / Bible Gateway as the floor
