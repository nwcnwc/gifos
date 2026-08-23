/*
 * gifos-help.js — Safe markdown for the OS app Help popup.
 *
 * Apps ship help.md inside the GIF (manifest.help, default "help.md").
 * The OS reads it at mount and renders it here. The dialect is a small
 * subset: headings, paragraphs, lists, bold/italic, inline code, fenced
 * blocks, https links. HTML in the file is escaped, never executed.
 *
 * Attaches to GifOS.help = { read, render, parse, withOsFooter }.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function bytesToText(b) {
    if (typeof b === 'string') return b;
    if (!b) return '';
    if (GifOS.gif && typeof GifOS.gif.bytesToText === 'function') return GifOS.gif.bytesToText(b);
    try { return new TextDecoder().decode(b); } catch (e) { return ''; }
  }

  function normPath(p) {
    return String(p || '').replace(/^\.?\//, '').replace(/\\/g, '/');
  }

  // Read help.md (or manifest.help) from a decoded GIF filesystem.
  function read(files, manifest) {
    if (!files) return '';
    let path = 'help.md';
    if (manifest && typeof manifest.help === 'string' && manifest.help.trim()) {
      path = normPath(manifest.help.trim());
    }
    if (!path || path.indexOf('..') !== -1 || path.charAt(0) === '/' ||
        path.indexOf(':') !== -1 || path.indexOf('\\') !== -1 ||
        path.indexOf('.state/') === 0 || path.indexOf('.lock/') === 0) {
      return '';
    }
    const bytes = files[path];
    if (!bytes) return '';
    try {
      let s = bytesToText(bytes);
      if (typeof s !== 'string') return '';
      s = s.replace(/^\uFEFF/, '');
      if (s.length > 65536) s = s.slice(0, 65536);
      return s;
    } catch (e) { return ''; }
  }

  function inlineMd(escaped) {
    // Order: code, then links, then bold, then italic. Input is already
    // HTML-escaped, so the replacements only add the tags we intend.
    let s = escaped;
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/\*([^*]+)\*/g, '<i>$1</i>');
    return s;
  }

  function flushPara(para, out) {
    if (!para.length) return;
    const t = para.join(' ').trim();
    para.length = 0;
    if (t) out.push('<p>' + inlineMd(escapeHtml(t)) + '</p>');
  }

  function flushList(list, out) {
    if (!list) return null;
    const tag = list.type;
    out.push('<' + tag + '>' + list.items.map((it) => '<li>' + inlineMd(escapeHtml(it)) + '</li>').join('') + '</' + tag + '>');
    return null;
  }

  function render(md) {
    if (!md || !String(md).trim()) return '';
    const lines = String(md).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const out = [];
    const para = [];
    let list = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/\s+$/, '');
      if (line.slice(0, 3) === '```') {
        flushPara(para, out);
        list = flushList(list, out);
        const buf = [];
        i++;
        while (i < lines.length && lines[i].slice(0, 3) !== '```') {
          buf.push(lines[i]);
          i++;
        }
        out.push('<pre><code>' + escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }
      if (!line.trim()) {
        flushPara(para, out);
        list = flushList(list, out);
        continue;
      }
      if (/^---+$/.test(line.trim())) {
        flushPara(para, out);
        list = flushList(list, out);
        out.push('<hr>');
        continue;
      }
      const h = /^(#{1,4})\s+(.+)$/.exec(line);
      if (h) {
        flushPara(para, out);
        list = flushList(list, out);
        const tag = h[1].length <= 1 ? 'h3' : 'h4';
        out.push('<' + tag + '>' + inlineMd(escapeHtml(h[2].trim())) + '</' + tag + '>');
        continue;
      }
      const ul = /^[-*]\s+(.+)$/.exec(line);
      if (ul) {
        flushPara(para, out);
        if (!list || list.type !== 'ul') { list = flushList(list, out); list = { type: 'ul', items: [] }; }
        list.items.push(ul[1]);
        continue;
      }
      const ol = /^\d+\.\s+(.+)$/.exec(line);
      if (ol) {
        flushPara(para, out);
        if (!list || list.type !== 'ol') { list = flushList(list, out); list = { type: 'ol', items: [] }; }
        list.items.push(ol[1]);
        continue;
      }
      list = flushList(list, out);
      para.push(line.trim());
    }
    flushPara(para, out);
    flushList(list, out);
    return out.join('');
  }

  // First ATX h1 becomes the modal title and is stripped from the body so
  // it is not repeated under the heading the OS already drew.
  function parse(md) {
    const text = String(md || '').replace(/^\uFEFF/, '').replace(/^\s+/, '');
    const m = /^#\s+(.+)\n+/.exec(text);
    if (m) {
      return { title: m[1].trim(), html: render(text.slice(m[0].length)) };
    }
    return { title: '', html: render(text) };
  }

  // Appended to EVERY Help screen — the bar above the app, plus a remix
  // plug. Apps write how THEY work; the OS writes how GifOS apps work.
  const OS_FOOTER = [
    '## Using a GifOS app',
    '',
    '- **Invite** — share this app live. Friends open one link and everyone uses the same app together.',
    '- **Save** — download a snapshot GIF: the app plus whatever it has saved, yours to keep.',
    '- **Steal** — if you joined someone else, copy the app onto your desktop (with their data, as they joined, or clean).',
    '- The chip is **Abilities** — what this app may do on this device. Tap to review or turn things off.',
    '',
    '## Make it yours',
    '',
    'Every GifOS app is a GIF you can remix. **Save** that GIF, drop it into your favorite AI chat, and ask it to change the game — a dark mode, bigger buttons, a new rule, whatever you want. Add the GIF it gives you back to your Home Screen and play your remixed version. You do not need to know how to code. This is how GifOS apps get better: you make the next one.',
  ].join('\n');

  const EMPTY_INTRO = '# Help\n\nThis app did not ship its own Help page.';

  function withOsFooter(md) {
    const body = String(md || '').replace(/^\uFEFF/, '').replace(/\s+$/, '');
    if (!body) return EMPTY_INTRO + '\n\n' + OS_FOOTER;
    return body + '\n\n---\n\n' + OS_FOOTER;
  }

  GifOS.help = { read, render, parse, withOsFooter };
})(typeof window !== 'undefined' ? window : globalThis);
