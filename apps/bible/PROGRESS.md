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
- Source survey — eBible.org, 1550 rows
- `tools/catalog.mjs` — the public-domain filter -> `data/ebible-pd.json`
- `data/books.json` — 86 USFM book codes, canon + deuterocanon
- `tools/usfx.mjs` — USFX -> paragraphs, poetry lines, words of Christ,
  translators' footnotes, cross-references, section headings, NATIVE book names
- `tools/build-packs.mjs` — GBP2 packs, 108 texts, 46 languages, 111 MB
- `js/pack.js` — the reader's pack reader (native DecompressionStream)
- `test/unit/bible-pack.js` — 9 assertions, 108 packs, green

## Versification is a first-class problem
Chapter and verse divisions are not universal, and a parallel reading silently
misaligns if nobody looks. 93 packs count the English way, 9 the Greek way
(Psalms 9-10 merged, so the Psalter runs one lower and there is a Psalm 151),
6 the Hebrew way (Joel in four chapters). Each pack records which. The reader
has to map between them and say so when a reference cannot cross exactly.

## Next
- Reference mapping across the three traditions
- Reader shell: chapter view, parallel columns, search, navigation
- Study apparatus: Strong's, interlinear, cross-references, dictionaries
- Notes/highlights/plans in gifos.db
- Shared reading over an invite link, with the nav cursor as the lead record
- Icon, cover, listing; then the gauntlet rounds
