// The sealed credit must carry the MIT/Apache copyright line from COPYING,
// not only an SPDX name. Store listing and Help Credits both derive from
// scripts/app-credits.mjs — one extract, both surfaces.
const path = require('path');
const { pathToFileURL } = require('url');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

(async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '../../scripts/app-credits.mjs')).href);
  const { copyrightFromApp, copyrightLinesFromText, creditsOf, creditsJson } = mod;

  const mit = copyrightLinesFromText(
    'MIT License\n\nCopyright (c) 2017 Johannes Kronmüller\n\nPermission is hereby granted',
    'COPYING-slots.txt'
  );
  check('MIT header yields the Copyright (c) line',
    mit.length === 1 && mit[0] === 'Copyright (c) 2017 Johannes Kronmüller', mit);

  const apache = copyrightLinesFromText(
    '                                 Apache License\n                           Version 2.0, January 2004\n',
    'COPYING-yopass.txt'
  );
  check('Apache license BODY is not treated as the project copyright', apache.length === 0, apache);

  const notice = copyrightLinesFromText(
    'JSON Editor\n\nCopyright (C) 2011-2026 Jos de Jong\n\nLicensed under the Apache License',
    'NOTICE.txt'
  );
  check('Apache NOTICE yields the holder line',
    notice.length === 1 && /Jos de Jong/.test(notice[0]), notice);

  const gpl = copyrightLinesFromText(
    '                    GNU GENERAL PUBLIC LICENSE\n                       Version 3\n Copyright (C) 2007 Free Software Foundation, Inc. <http://fsf.org/>\n',
    'COPYING-stockfish.txt'
  );
  check('GPL FSF copyright on the license document is skipped', gpl.length === 0, gpl);

  const slots = copyrightFromApp('slots');
  check('slots COPYING is Johannes Kronmüller', /Johannes Kronmüller/.test(slots), slots);

  const editor = copyrightFromApp('json-editor');
  check('json-editor NOTICE is Jos de Jong', /Jos de Jong/.test(editor), editor);

  const yopass = copyrightFromApp('yopass');
  check('yopass Apache body has no fake holder line', yopass === '', yopass);

  const listing = {
    tagline: 'Pull the lever.',
    author: { name: 'johakr', url: 'https://github.com/johakr/html5-slot-machine' },
    porter: { name: 'GifOS', url: 'https://gifos.app' },
    basedOn: { name: 'html5-slot-machine', url: 'https://github.com/johakr/html5-slot-machine', blessed: false },
    license: 'MIT',
    homepage: 'https://github.com/nwcnwc/gifos/tree/main/apps/slots',
    releaseDate: '2026-08-24',
  };
  const cred = creditsOf(listing, 'slots');
  check('creditsOf(slots) includes SPDX + copyright from COPYING',
    cred.license === 'MIT' && /Johannes Kronmüller/.test(cred.copyright), cred.copyright);
  check('creditsJson is stable JSON with copyright after license',
    /"license": "MIT",\n  "copyright": "Copyright \(c\) 2017 Johannes Kronmüller"/.test(creditsJson(listing, 'slots')));
  check('without a slug, creditsOf does not invent a copyright',
    creditsOf(listing).copyright === undefined);

  const override = creditsOf(Object.assign({}, listing, { copyright: 'Copyright (c) 1999 Override' }), 'slots');
  check('listing.copyright overrides file extract', override.copyright === 'Copyright (c) 1999 Override');

  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
