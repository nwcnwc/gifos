/*
 * gifos-help.js — Safe markdown for the OS app Help popup.
 *
 * Apps ship help.md inside the GIF (manifest.help, default "help.md").
 * The OS reads it at mount and renders it here. The dialect is a small
 * subset: headings, paragraphs, lists, bold/italic, inline code, fenced
 * blocks, https links. HTML in the file is escaped, never executed.
 *
 * Attaches to GifOS.help = { read, readCredits, render, parse, withOsFooter, creditsMd }.
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

  // CREDITS — UNDER THE SEAL. Who made an app is read from credits.json
  // INSIDE the GIF (packed by scripts/sign-apps.mjs from the store listing,
  // covered by the gifos.app signature like every other packed file), so the
  // credit is the same in a stolen copy, on a guest's device, in a Save —
  // and cannot be edited on a desktop record without breaking the seal. A
  // GIF without one (hand-built, remixed, or installed before credits were
  // packed) credits only what its own sealed manifest says: name + version.
  // The file record adds one LOCAL fact — when this copy was installed.
  // Rendered LAST, under the OS footer — the very bottom of every Help.
  // Text goes through the same renderer as help.md, so raw HTML is escaped
  // and only https links become hrefs; a listing can't script the Help modal.
  const CREDITS_PATH = 'credits.json';
  function readCredits(files, manifest) {
    const m = manifest || {};
    const out = { name: typeof m.name === 'string' ? m.name : '', version: typeof m.version === 'string' ? m.version : '' };
    if (!out.name && !out.version && !(files && files[CREDITS_PATH])) return null;
    const bytes = files && files[CREDITS_PATH];
    if (bytes) {
      try {
        let s = bytesToText(bytes);
        if (typeof s === 'string' && s.length <= 16384) {
          const c = JSON.parse(s.replace(/^\uFEFF/, ''));
          if (c && typeof c === 'object' && !Array.isArray(c)) {
            for (const k of ['tagline', 'author', 'porter', 'basedOn', 'inspiredBy', 'license', 'copyright', 'homepage', 'releaseDate']) {
              if (c[k] != null) out[k] = c[k];
            }
            out.sealed = true;
          }
        }
      } catch (e) { /* a broken credits.json credits nothing beyond the manifest */ }
    }
    return out;
  }
  function mdText(s) {
    return String(s == null ? '' : s).replace(/[\[\]\\]/g, '').replace(/\s+/g, ' ').trim();
  }
  function person(p) {
    if (!p) return '';
    if (typeof p === 'string') return mdText(p);
    const name = mdText(p.name);
    if (!name) return '';
    const url = typeof p.url === 'string' && /^https:\/\/[^\s)]+$/.test(p.url.trim()) ? p.url.trim() : '';
    return url ? '[' + name + '](' + url + ')' : name;
  }
  function creditsMd(meta) {
    if (!meta || typeof meta !== 'object') return '';
    const out = ['## Credits', ''];
    const name = mdText(meta.name);
    const ver = mdText(meta.version);
    if (name) out.push('**' + name + (ver ? ' ' + ver : '') + '**');
    const author = person(meta.author);
    if (author) out.push('- **By** ' + author);
    const porter = person(meta.porter);
    if (porter) out.push('- **Brought to GifOS by** ' + porter);
    const based = person(meta.basedOn);
    if (based) out.push('- **Based on** ' + based);
    const insp = meta.inspiredBy;
    if (insp && (insp.name || typeof insp === 'string')) {
      const by = insp && typeof insp === 'object' ? person(insp.by) : '';
      out.push('- **Inspired by** ' + person(insp) + (by ? ' by ' + by : ''));
    }
    const lic = mdText(meta.license);
    const copy = mdText(meta.copyright);
    if (lic) out.push('- **License** ' + lic + (copy ? ' — ' + copy : ''));
    else if (copy) out.push('- **Copyright** ' + copy);
    const home = typeof meta.homepage === 'string' && /^https:\/\/[^\s)]+$/.test(meta.homepage.trim()) ? meta.homepage.trim() : '';
    if (home) out.push('- **Home** [' + home.replace(/^https:\/\//, '') + '](' + home + ')');
    const rel = mdText(meta.releaseDate);
    if (rel) out.push('- **Released** ' + rel);
    if (!name && !author && !porter && !based && out.length === 2) return '';
    const when = mdText(meta.installedAt);
    const signer = mdText(meta.signedBy);
    const tail = [];
    if (signer) tail.push('Sealed inside this GIF and signed by **' + signer + '**');
    else if (meta.sealed) tail.push('Sealed inside this GIF');
    else tail.push('From this GIF\u2019s own manifest');
    if (when) tail.push('installed on this device on ' + when.slice(0, 10));
    out.push('');
    out.push(tail.join('; ') + '.');
    return out.join('\n');
  }

  function withOsFooter(md, storeMeta) {
    const body = String(md || '').replace(/^\uFEFF/, '').replace(/\s+$/, '');
    const credits = creditsMd(storeMeta);
    const tail = OS_FOOTER + (credits ? '\n\n---\n\n' + credits : '');
    if (!body) return EMPTY_INTRO + '\n\n' + tail;
    return body + '\n\n---\n\n' + tail;
  }

  GifOS.help = { read, readCredits, render, parse, withOsFooter, creditsMd };
})(typeof window !== 'undefined' ? window : globalThis);
