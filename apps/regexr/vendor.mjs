// Rebuild vendor/ from the pinned gskinner/regexr commit.
// Needs network. Run: node apps/regexr/vendor.mjs
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PIN = 'd18630d02372b38614f220576bd1888326cf8e78';
const RAW = 'https://raw.githubusercontent.com/gskinner/regexr/' + PIN + '/';
const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');
mkdirSync(out, { recursive: true });

const HDR = `/*
RegExr: Learn, Build, & Test RegEx
Copyright (C) 2017 gskinner.com, inc.

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
Converted from ESM to a classic IIFE for the GifOS sandbox.
Pinned commit ${PIN}.
*/
`;

async function get(path) {
  const r = await fetch(RAW + path);
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.text();
}

function stripLicense(src) {
  return src.replace(/^\/\*[\s\S]*?\*\/\s*/, '');
}

function noModule(src) {
  return src
    .replace(/^import\s+[^;]+;\s*/gm, '')
    .replace(/^export\s+default\s+/m, '')
    .replace(/^export\s+default\s+/gm, '');
}

function wrap(name, body) {
  return HDR + '(function (root) {\n"use strict";\n' + body + '\n})(typeof window !== "undefined" ? window : globalThis);\n';
}

const lexerSrc = noModule(stripLicense(await get('dev/src/ExpressionLexer.js')));
const coreSrc = noModule(stripLicense(await get('dev/src/profiles/core.js')));
const jsSrc = noModule(stripLicense(await get('dev/src/profiles/javascript.js')));
const refSrc = noModule(stripLicense(await get('dev/src/docs/reference_content.js')));
const license = await get('LICENSE');

const lexer = wrap('lexer', `
var Utils = {
  copy: function (target, source) {
    for (var n in source) target[n] = source[n];
    return target;
  }
};
${lexerSrc.replace(/export default class ExpressionLexer/, 'class ExpressionLexer').replace(/^class ExpressionLexer/, 'class ExpressionLexer')}
root.RegExrLexer = ExpressionLexer;
`);

const profiles = wrap('profiles', `
${coreSrc}
${jsSrc.replace(/let y=true, n=false;\s*/, '')}
function merge(p1, p2) {
  for (var n in p1) {
    if (p2[n] === false) continue;
    else if (typeof p1[n] === "object") p2[n] = merge(p1[n], p2[n] || {});
    else if (p2[n] === undefined) p2[n] = p1[n];
  }
  return p2;
}
root.RegExrProfiles = { core: core, js: merge(core, javascript) };
`);

const reference = wrap('reference', `
${refSrc}
function stripLinks(s) {
  if (!s || typeof s !== "string") return s;
  return s.replace(/<a\\s+href=['"][^'"]+['"][^>]*>([\\s\\S]*?)<\\/a>/gi, "$1");
}
function walk(node) {
  if (!node) return;
  if (typeof node.desc === "string") node.desc = stripLinks(node.desc);
  if (typeof node.ext === "string") node.ext = stripLinks(node.ext);
  if (typeof node.tip === "string") node.tip = stripLinks(node.tip);
  var kids = node.kids;
  if (kids) for (var i = 0; i < kids.length; i++) walk(kids[i]);
}
walk(reference_content);
root.RegExrReference = reference_content;
`);

const cheatsheet = wrap('cheatsheet', `
root.RegExrCheatsheet = [
  { h: "Character classes" },
  { t: ".", d: "any character except newline", ins: "." },
  { t: "\\\\w  \\\\d  \\\\s", d: "word, digit, whitespace", ins: "\\\\w" },
  { t: "\\\\W  \\\\D  \\\\S", d: "not word, digit, whitespace", ins: "\\\\W" },
  { t: "[abc]", d: "any of a, b, or c", ins: "[abc]" },
  { t: "[^abc]", d: "not a, b, or c", ins: "[^abc]" },
  { t: "[a-g]", d: "character between a & g", ins: "[a-g]" },
  { h: "Anchors" },
  { t: "^abc$", d: "start / end of the string", ins: "^" },
  { t: "\\\\b  \\\\B", d: "word, not-word boundary", ins: "\\\\b" },
  { h: "Escaped characters" },
  { t: "\\\\.  \\\\*  \\\\\\\\", d: "escaped special characters", ins: "\\\\." },
  { t: "\\\\t  \\\\n  \\\\r", d: "tab, linefeed, carriage return", ins: "\\\\n" },
  { h: "Groups & Lookaround" },
  { t: "(abc)", d: "capture group", ins: "(abc)" },
  { t: "\\\\1", d: "backreference to group #1", ins: "\\\\1" },
  { t: "(?:abc)", d: "non-capturing group", ins: "(?:abc)" },
  { t: "(?=abc)", d: "positive lookahead", ins: "(?=abc)" },
  { t: "(?!abc)", d: "negative lookahead", ins: "(?!abc)" },
  { h: "Quantifiers & Alternation" },
  { t: "a*  a+  a?", d: "0 or more, 1 or more, 0 or 1", ins: "+" },
  { t: "a{5} a{2,}", d: "exactly five, two or more", ins: "{2,}" },
  { t: "a{1,3}", d: "between one & three", ins: "{1,3}" },
  { t: "a+? a{2,}?", d: "match as few as possible", ins: "+?" },
  { t: "ab|cd", d: "match ab or cd", ins: "|" }
];
`);

function checkScript(name, s) {
  if (/<\/script/i.test(s)) throw new Error(name + ' contains </script');
}

checkScript('lexer', lexer);
checkScript('profiles', profiles);
checkScript('reference', reference);
checkScript('cheatsheet', cheatsheet);

writeFileSync(join(out, 'lexer.js'), lexer);
writeFileSync(join(out, 'profiles.js'), profiles);
writeFileSync(join(out, 'reference.js'), reference);
writeFileSync(join(out, 'cheatsheet.js'), cheatsheet);
writeFileSync(join(out, 'COPYING.txt'), license);
writeFileSync(join(dir, 'COPYING.txt'), license);

const sha = (s) => createHash('sha256').update(s).digest('hex');
const note = [
  'gskinner/regexr',
  'https://github.com/gskinner/regexr',
  'GPL-3.0, Copyright (C) 2017 gskinner.com, inc.',
  'Pinned commit ' + PIN,
  '',
  'Vendored as classic IIFE (no ESM) for the GifOS sandbox:',
  '  lexer.js       ExpressionLexer.js',
  '  profiles.js    profiles/core.js + javascript.js + merge',
  '  reference.js   docs/reference_content.js (external <a href> stripped)',
  '  cheatsheet.js  the Cheatsheet table from index.html',
  '',
  'Not vendored: CodeMirror, PHP/PCRE server solver, community catalog,',
  'accounts, ads, webfonts. Matching uses the browser RegExp in-thread',
  '(BrowserSolver.js algorithm, no Worker).',
  '',
  'sha256 lexer.js     ' + sha(lexer),
  'sha256 profiles.js  ' + sha(profiles),
  'sha256 reference.js ' + sha(reference),
  'sha256 cheatsheet.js ' + sha(cheatsheet),
].join('\n') + '\n';
writeFileSync(join(out, 'UPSTREAM.txt'), note);

console.log('wrote vendor/ from', PIN.slice(0, 12));
console.log('  lexer     ', (lexer.length / 1024).toFixed(1), 'KB');
console.log('  profiles  ', (profiles.length / 1024).toFixed(1), 'KB');
console.log('  reference ', (reference.length / 1024).toFixed(1), 'KB');
console.log('  cheatsheet', (cheatsheet.length / 1024).toFixed(1), 'KB');
