/*
RegExr: Learn, Build, & Test RegEx
Copyright (C) 2017 gskinner.com, inc.

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
Converted from ESM to a classic IIFE for the GifOS sandbox.
Pinned commit d18630d02372b38614f220576bd1888326cf8e78.
*/
(function (root) {
"use strict";

root.RegExrCheatsheet = [
  { h: "Character classes" },
  { t: ".", d: "any character except newline", ins: "." },
  { t: "\\w  \\d  \\s", d: "word, digit, whitespace", ins: "\\w" },
  { t: "\\W  \\D  \\S", d: "not word, digit, whitespace", ins: "\\W" },
  { t: "[abc]", d: "any of a, b, or c", ins: "[abc]" },
  { t: "[^abc]", d: "not a, b, or c", ins: "[^abc]" },
  { t: "[a-g]", d: "character between a & g", ins: "[a-g]" },
  { h: "Anchors" },
  { t: "^abc$", d: "start / end of the string", ins: "^" },
  { t: "\\b  \\B", d: "word, not-word boundary", ins: "\\b" },
  { h: "Escaped characters" },
  { t: "\\.  \\*  \\\\", d: "escaped special characters", ins: "\\." },
  { t: "\\t  \\n  \\r", d: "tab, linefeed, carriage return", ins: "\\n" },
  { h: "Groups & Lookaround" },
  { t: "(abc)", d: "capture group", ins: "(abc)" },
  { t: "\\1", d: "backreference to group #1", ins: "\\1" },
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

})(typeof window !== "undefined" ? window : globalThis);
