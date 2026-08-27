# Bible app — live progress note

Gauntlet-loop build of a new App Store app: `apps/bible/`.

## Hard constraints
- **Public-domain texts only.** eBible.org rows are taken only when their own
  catalog says `Copyright: public domain` and `Redistributable: True`.
  Supplements from any other source are vetted title-by-title (pre-1929
  publication) and recorded in `data/translations.json` with the reason.
  No modern copyrighted translation ships here, ever.
- Platform walls (apps/README.md, site/llms.txt): everything vendored inside
  the GIF or on a manifest asset pin; data only in gifos.db; no CDN.

## State
- [x] Source survey: eBible.org catalog (1550 rows) → 111 PD, 48 languages
- [ ] Vetted translation list
- [ ] Study apparatus sources
- [ ] Ingest pipeline
- [ ] Reader core
- [ ] Gauntlet rounds
