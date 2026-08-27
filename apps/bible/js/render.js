/* Setting a chapter.
 *
 * A pack stores each verse's text with its layout, and this turns that back
 * into a page. Two things it must get right, because they are the difference
 * between a Bible and a wall of text:
 *
 *   BLOCKS. A verse whose layout entry is empty CONTINUES the block above it.
 *   That is how a paragraph runs across verse boundaries, which is how prose
 *   is actually printed and how poetry keeps its shape.
 *
 *   MID-VERSE STRUCTURE. A paragraph or a poetry line can begin inside a
 *   verse. The pack marks those inline rather than splitting the verse,
 *   because splitting would break every reference made to it.
 *
 * Nothing here uses innerHTML. Scripture text goes in as text nodes, so a
 * translation carrying an angle bracket is a character, never markup.
 */
(function (root) {
  'use strict';

  var WJ_ON = '\u0001', WJ_OFF = '\u0002';
  var NOTE = '\u0003', XREF = '\u0004';
  var ADD_ON = '\u0005', ADD_OFF = '\u0006';
  var ND_ON = '\u000e', ND_OFF = '\u000f';
  var BREAK = '\u0010', PARA = '\u0011';
  var ALL_MARKS = /[\u0001-\u0006\u000e-\u0011]/;

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  // Strip every mark. Used for copying, sharing, searching and read-aloud —
  // wherever the text has to be plain.
  function plain(s) {
    if (!s) return '';
    return s.replace(/[\u0001\u0002\u0005\u0006\u000e\u000f]/g, '')
            .replace(/\u0010\d?/g, ' ')
            .replace(/[\u0011\u0003\u0004]/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
  }

  /* Walk a verse's marked text, handing the caller each run of characters with
   * the styles in force, and each structural break as it arrives. One pass, no
   * regex backtracking, because this runs for every verse on every repaint. */
  function walk(text, on) {
    var buf = '', wj = 0, add = 0, nd = 0, note = 0, xref = 0;
    var flush = function () {
      if (!buf) return;
      on.text(buf, { wj: !!wj, add: !!add, nd: !!nd });
      buf = '';
    };
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      switch (c) {
        case WJ_ON: flush(); wj++; break;
        case WJ_OFF: flush(); if (wj) wj--; break;
        case ADD_ON: flush(); add++; break;
        case ADD_OFF: flush(); if (add) add--; break;
        case ND_ON: flush(); nd++; break;
        case ND_OFF: flush(); if (nd) nd--; break;
        case NOTE: flush(); on.note(note++); break;
        case XREF: flush(); on.xref(xref++); break;
        case PARA: flush(); on.para(); break;
        case BREAK:
          flush();
          var lvl = text[i + 1];
          if (lvl >= '1' && lvl <= '9') { i++; on.line(+lvl); }
          else on.line(1);
          break;
        default: buf += c;
      }
    }
    flush();
  }

  var STYLE_CLASS = {
    p: 'b-p', m: 'b-m', pi: 'b-pi', pc: 'b-pc', d: 'b-d',
    q1: 'b-q b-q1', q2: 'b-q b-q2', q3: 'b-q b-q3',
    li1: 'b-li b-li1', li2: 'b-li b-li2', li3: 'b-li b-li3'
  };
  function blockClass(style) { return STYLE_CLASS[style] || 'b-p'; }

  /* chapter: what pack.chapter() returned.
   * opts: { mode: 'paragraph'|'verse', redLetter, showNotes, showHeadings,
   *         onVerse(ref, node, ev), onNote(kind, text, ev), marks }
   * marks: { <verseIndex>: 'amber'|'rose'|… } — a highlight colour per verse.
   */
  function chapter(ch, opts) {
    opts = opts || {};
    var verseMode = opts.mode === 'verse';
    var frag = document.createDocumentFragment();
    var block = null, blockStyle = null;

    var openBlock = function (style) {
      block = el('p', blockClass(style));
      blockStyle = style;
      frag.appendChild(block);
      return block;
    };

    for (var vi = 0; vi < ch.verses.length; vi++) {
      var v = ch.verses[vi];
      if (v.empty && !v.head) continue;   // a numbering gap this text does not fill

      if (v.head && opts.showHeadings !== false) {
        var h = el('h2', 'b-head');
        h.textContent = v.head;
        frag.appendChild(h);
        block = null;
      }

      // Verse mode gives every verse its own block; paragraph mode only starts
      // one where the text says a block starts.
      if (verseMode || !block || v.style) openBlock(v.style || blockStyle || 'p');

      var span = el('span', 'v');
      span.setAttribute('data-i', String(v.index));
      span.setAttribute('data-v', String(v.verse));
      if (opts.marks && opts.marks[v.index]) {
        span.classList.add('hl');
        span.setAttribute('data-hl', opts.marks[v.index]);
      }

      var num = el('sup', 'vn');
      num.textContent = String(v.verse);
      span.appendChild(num);

      var target = span;
      var notes = v.notes, xrefs = v.xrefs;
      /* eslint-disable no-loop-func */
      (function (verse) {
        walk(verse.text, {
          text: function (s, st) {
            var node;
            if (st.wj && opts.redLetter !== false) { node = el('span', 'wj'); node.textContent = s; }
            else if (st.add) { node = el('em', 'add'); node.textContent = s; }
            else if (st.nd) { node = el('span', 'nd'); node.textContent = s; }
            else node = document.createTextNode(s);
            target.appendChild(node);
          },
          note: function (n) {
            if (opts.showNotes === false) return;
            var a = el('button', 'anchor note');
            a.type = 'button';
            a.textContent = '*';
            a.title = 'Translators’ note';
            a.setAttribute('data-note', String(n));
            a.setAttribute('data-i', String(verse.index));
            target.appendChild(a);
          },
          xref: function (n) {
            if (opts.showNotes === false) return;
            var a = el('button', 'anchor xref');
            a.type = 'button';
            a.textContent = '†';
            a.title = 'Cross reference';
            a.setAttribute('data-xref', String(n));
            a.setAttribute('data-i', String(verse.index));
            target.appendChild(a);
          },
          para: function () {
            // The paragraph turns inside this verse: close the span, open a new
            // block, and carry the same verse on into it so its number is not
            // repeated and the text is still one verse to every other feature.
            block.appendChild(span);
            openBlock('p');
            span = el('span', 'v cont');
            span.setAttribute('data-i', String(verse.index));
            span.setAttribute('data-v', String(verse.verse));
            if (opts.marks && opts.marks[verse.index]) {
              span.classList.add('hl');
              span.setAttribute('data-hl', opts.marks[verse.index]);
            }
            target = span;
          },
          line: function (lvl) {
            if (verseMode) { target.appendChild(document.createTextNode(' ')); return; }
            block.appendChild(span);
            openBlock('q' + Math.min(3, lvl));
            span = el('span', 'v cont');
            span.setAttribute('data-i', String(verse.index));
            span.setAttribute('data-v', String(verse.verse));
            if (opts.marks && opts.marks[verse.index]) {
              span.classList.add('hl');
              span.setAttribute('data-hl', opts.marks[verse.index]);
            }
            target = span;
          }
        });
      })(v);
      /* eslint-enable no-loop-func */

      block.appendChild(span);
      if (!verseMode) block.appendChild(document.createTextNode(' '));
      void notes; void xrefs;
    }

    return frag;
  }

  /* Span highlights: a Kindle-style mark is a range of CHARACTERS in the
   * readable verse, not a whole verse. Verse numbers and footnote stars are
   * not characters, so a walk of the painted verse has to skip them. */

  function skippedText(node, root) {
    var n = node.nodeType === 3 ? node.parentNode : node;
    while (n && n !== root) {
      if (n.classList && (n.classList.contains('vn') || n.classList.contains('anchor') || n.classList.contains('cnum'))) return true;
      n = n.parentNode;
    }
    return false;
  }

  function collectText(root) {
    var pieces = [], pos = 0;
    if (!root) return { pieces: pieces, length: 0 };
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = w.nextNode())) {
      if (skippedText(n, root) || !n.data) continue;
      pieces.push({ node: n, start: pos, end: pos + n.data.length });
      pos += n.data.length;
    }
    return { pieces: pieces, length: pos };
  }

  function offsetOf(root, node, off) {
    if (!root || !node) return -1;
    if (node.nodeType === 1) {
      var child = node.childNodes[off];
      if (!child) return collectText(root).length;
      node = child;
      off = 0;
    }
    var t = collectText(root);
    for (var i = 0; i < t.pieces.length; i++) {
      if (t.pieces[i].node === node) {
        var o = off;
        if (o < 0) o = 0;
        if (o > t.pieces[i].node.data.length) o = t.pieces[i].node.data.length;
        return t.pieces[i].start + o;
      }
    }
    return -1;
  }

  function wrapOffsets(root, start, end, colour, id) {
    if (!root || !(end > start)) return;
    var t = collectText(root);
    for (var i = t.pieces.length - 1; i >= 0; i--) {
      var p = t.pieces[i];
      var a = Math.max(start, p.start);
      var b = Math.min(end, p.end);
      if (!(b > a)) continue;
      var node = p.node;
      var localA = a - p.start, span = b - a;
      if (localA > 0) node = node.splitText(localA);
      if (node.data.length > span) node.splitText(span);
      var mark = document.createElement('mark');
      mark.className = 'hl-span';
      mark.setAttribute('data-hl', colour || 'amber');
      if (id) mark.setAttribute('data-hid', id);
      node.parentNode.insertBefore(mark, node);
      mark.appendChild(node);
    }
  }

  function wrapOffsetsMany(roots, start, end, colour, id) {
    var pos = 0, chunks = [];
    for (var i = 0; i < roots.length; i++) {
      var t = collectText(roots[i]);
      chunks.push({ root: roots[i], offset: pos, length: t.length });
      pos += t.length;
    }
    for (var j = chunks.length - 1; j >= 0; j--) {
      var c = chunks[j];
      var a = Math.max(start, c.offset);
      var b = Math.min(end, c.offset + c.length);
      if (b > a) wrapOffsets(c.root, a - c.offset, b - c.offset, colour, id);
    }
  }

  root.GifosBibleRender = {
    chapter: chapter,
    plain: plain,
    walk: walk,
    hasMarks: function (s) { return ALL_MARKS.test(s || ''); },
    collectText: collectText,
    offsetOf: offsetOf,
    wrapOffsets: wrapOffsets,
    wrapOffsetsMany: wrapOffsetsMany
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
