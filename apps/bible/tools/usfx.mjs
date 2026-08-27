// USFX -> the reader's own structure.
//
// The verse-per-line files this app started on are one flat line per verse.
// That is enough to STORE scripture and not nearly enough to SET it: Psalms
// comes out as prose, a paragraph never begins, the words of Christ are not
// marked, the translators' own footnotes are gone, and every book is named in
// English no matter what language the text is in. USFX carries all of that, so
// the ingest reads USFX and the packs carry layout.
//
// The parser is deliberately tolerant. It walks tokens rather than building a
// tree, and IGNORES any element it does not know instead of failing — the
// corpus is 108 texts prepared by many hands over thirty years, and a tag that
// appears twice in one Burmese book must not take the build down.
//
// Inline markers inside a verse are C0 control characters, so they can never
// collide with scripture text:
//
//   U+0001 U+0002   words of Christ
//   U+0003          footnote anchor      (nth anchor in a verse -> nth note)
//   U+0004          cross-reference anchor
//   U+0005 U+0006   words supplied by the translator (set in italic)
//   U+000E U+000F   the divine name (set in small capitals)
//   U+0010 + digit   a poetry line turns inside a verse, at that indent level
//   U+0011          a paragraph begins inside a verse

export const MARK = {
  WJ_ON: '\u0001', WJ_OFF: '\u0002',
  NOTE: '\u0003', XREF: '\u0004',
  ADD_ON: '\u0005', ADD_OFF: '\u0006',
  ND_ON: '\u000e', ND_OFF: '\u000f',
  BREAK: '\u0010', PARA: '\u0011',
};

const VOID = new Set(['v', 've', 'c', 'b', 'optionalLineBreak', 'cp', 'cl', 'fig']);

// Paragraph styles collapse to what the renderer actually draws.
function blockStyle(tag, a) {
  const s = (a.style || '').toLowerCase();
  const lvl = a.level ? String(a.level) : '';
  if (tag === 'q') {
    const m = /^q(\d)/.exec(s);
    return 'q' + (Math.min(3, +(m ? m[1] : lvl || 1) || 1));
  }
  if (tag === 'd') return 'd';                        // a psalm's own title line
  if (tag === 'li') return 'li' + Math.min(3, +((lvl || (/(\d)/.exec(s) || [])[1]) || 1));
  if (tag === 'pi') return 'pi';
  if (s === 'm' || s === 'nb') return 'm';            // flush left, no indent
  if (s === 'pc' || s === 'qc') return 'pc';          // centred
  return 'p';
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function unent(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const hex = e[1] === 'x' || e[1] === 'X';
      const n = parseInt(hex ? e.slice(2) : e.slice(1), hex ? 16 : 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENT[e] !== undefined ? ENT[e] : m;
  });
}

function attrsOf(s) {
  const out = {};
  const re = /([a-zA-Z0-9:_-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = unent(m[2]);
  return out;
}

export function parseUsfx(xml) {
  const books = [];
  const out = [];
  let book = null, chapter = 0, verse = 0;
  let buf = null;                     // pieces of the verse being read
  let pendingHead = null;             // an <s> seen before the next verse
  let notes = [], xrefs = [];
  let style = 'p', styleFree = true;  // block style, and whether a verse claimed it
  let inNote = 0, noteBuf = null;
  let inHead = 0, headBuf = null, headLevel = 0;
  let skip = 0;                       // depth inside an element dropped whole

  const push = (s) => {
    if (!s || skip) return;
    if (inNote) noteBuf.push(s);
    else if (inHead) headBuf.push(s);
    else if (buf) buf.push(s);
  };

  const closeVerse = () => {
    if (!buf) return;
    const text = buf.join('')
      .replace(/[ \t]*\n[ \t]*/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ (\u0010\d|\u0011) ?/g, '$1')
      .replace(/^(?:\u0010\d|\u0011)+|(?:\u0010\d|\u0011)+$/g, '')
      .trim();
    out.push({ book: book ? book.code : '', chapter, verse, text,
               style: styleFree ? style : '', head: pendingHead, notes, xrefs });
    styleFree = false;
    buf = null; pendingHead = null; notes = []; xrefs = [];
  };

  // A block boundary that lands mid-verse becomes an inline mark instead of a
  // new record — a paragraph legitimately begins inside a verse, and splitting
  // the verse there would break every reference to it.
  const openBlock = (st) => {
    if (buf) {
      // The break carries the level of the line it opens, so a couplet that
      // turns inside one verse still indents its second line.
      push(st[0] === 'q' ? MARK.BREAK + st.slice(1) : MARK.PARA);
      style = st;
      return;
    }
    style = st; styleFree = true;
  };

  const re = /<([!?/]?)([a-zA-Z0-9:_-]*)((?:"[^"]*"|[^>"])*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const lead = m[1], tag = m[2], rest = m[3], selfClose = m[4], text = m[5];
    if (text !== undefined) { push(unent(text)); continue; }
    if (lead === '!' || lead === '?') continue;
    const closing = lead === '/';
    const a = closing ? {} : attrsOf(rest);
    const empty = !!selfClose || VOID.has(tag);

    if (skip) {
      if (closing) skip--;
      else if (!empty) skip++;
      continue;
    }

    switch (tag) {
      case 'book':
        closeVerse();
        if (closing) book = null;
        else { book = { code: (a.id || '').toUpperCase(), names: {} }; chapter = 0; books.push(book); }
        break;
      case 'id':
        if (!closing && book && a.id) book.code = a.id.toUpperCase();
        if (!closing && !empty) skip = 1;
        break;
      case 'toc':
        if (closing) {
          if (book && headBuf) {
            const t = headBuf.join('').replace(/\s+/g, ' ').trim();
            const key = headLevel === 1 ? 'long' : headLevel === 2 ? 'short' : 'abbr';
            if (t && !book.names[key]) book.names[key] = t;
          }
          inHead = 0; headBuf = null;
        } else { headLevel = +(a.level || 1) || 1; inHead = 1; headBuf = []; }
        break;
      case 'h':
        if (closing) {
          if (book && headBuf) {
            const t = headBuf.join('').replace(/\s+/g, ' ').trim();
            if (t && !book.names.short) book.names.short = t;
          }
          inHead = 0; headBuf = null;
        } else { headLevel = 2; inHead = 1; headBuf = []; }
        break;

      case 'c':
        closeVerse();
        chapter = parseInt(a.id, 10) || chapter + 1;
        styleFree = true;
        break;
      case 'v':
        closeVerse();
        verse = parseInt(a.id, 10) || verse + 1;
        buf = [];
        break;
      case 've':
        closeVerse();
        break;

      case 'p': case 'q': case 'd': case 'li': case 'pi': case 'pc': case 'cls':
        if (!closing) openBlock(blockStyle(tag, a));
        break;
      case 'b':
        if (!buf) styleFree = true;
        break;

      case 's': case 'ms': case 'mt': case 'mte':
        if (closing) {
          const t = (headBuf || []).join('').replace(/\s+/g, ' ').trim();
          if (t) pendingHead = t;
          inHead = 0; headBuf = null;
        } else { closeVerse(); inHead = 1; headBuf = []; }
        break;

      case 'wj':  push(closing ? MARK.WJ_OFF  : MARK.WJ_ON);  break;
      case 'add': case 'addpn':
                  push(closing ? MARK.ADD_OFF : MARK.ADD_ON); break;
      case 'nd':  push(closing ? MARK.ND_OFF  : MARK.ND_ON);  break;

      case 'f': case 'ef':
        if (closing) {
          if (noteBuf) { const t = noteBuf.join('').replace(/\s+/g, ' ').trim(); if (t) notes.push(t); }
          inNote = 0; noteBuf = null;
        } else { push(MARK.NOTE); inNote = 1; noteBuf = []; }
        break;
      case 'x': case 'ex':
        if (closing) {
          if (noteBuf) { const t = noteBuf.join('').replace(/\s+/g, ' ').trim(); if (t) xrefs.push(t); }
          inNote = 0; noteBuf = null;
        } else { push(MARK.XREF); inNote = 1; noteBuf = []; }
        break;
      // A note's caller and origin only repeat the reference already on screen.
      case 'fr': case 'xo': case 'fk': case 'fl':
        if (!closing && !empty) skip = 1;
        break;

      case 'optionalLineBreak': push(' '); break;
      case 'cl': case 'cp': case 'ide': case 'periph': case 'fig': case 'rem':
        if (!closing && !empty) skip = 1;
        break;

      // Everything else — w, wh, k, pn, it, bd, em, sc, qs, bk, ref, tables —
      // contributes its text and carries no markup into the pack.
      default: break;
    }
  }
  closeVerse();
  return { books, verses: out };
}
