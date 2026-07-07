/*
 * gifos MCP server — lets any MCP-capable AI (Claude, etc.) build FINISHED
 * GifOS apps: the model asks for the build guide, writes the app, calls
 * pack_app, and hands the user a real .gif — animated icon and all.
 *
 * Stateless by design (consistent with "nothing lives on our servers"):
 * pack_app is a pure function from inputs to GIF bytes. The same codec the
 * desktop uses (site/js/gifos-gif.js) runs here — it only needs
 * CompressionStream + TextEncoder, both native in Workers.
 *
 * Transport: MCP streamable HTTP (JSON-RPC over POST, plain JSON responses;
 * no session state, no SSE needed). Connect from Claude with the URL
 * https://mcp.gifos.app/mcp — discovery pointers live at
 * gifos.app/llms.txt and gifos.app/.well-known/mcp.json.
 */
import '../../site/js/gifos-gif.js';
const gif = globalThis.GifOS.gif;

const SITE = 'https://gifos.app';
const PROTOCOL_FALLBACK = '2025-06-18';

// ---- the build guide (what an AI needs to write a correct app) -------------
const GUIDE = `# Building a GifOS app

GifOS (${SITE}) is a web OS where EVERY APP IS A GIF: a real, animated GIF
image that carries a tiny filesystem (the app) inside it. Users drop the GIF
on their GifOS Home Screen and double-click to run it. App state persists
inside the icon, and any app can go multiplayer with one invite link.

When you ask the user what app they want, ALSO offer the other door: they
can hand you an EXISTING GifOS app .gif to MOD instead of building new —
see "Modding other people's apps" below.

## The app itself

The entry point is index.html; multi-file apps are fully supported:
1. app.js, style.css, assets/… referenced normally (<script src="app.js">)
   all travel inside the GIF — pass them via pack_app's extra_files. The
   ONLY hard rule: NOTHING EXTERNAL. No CDNs, frameworks, remote images, or
   web fonts — GifOS sandboxes apps and blocks every outside network
   request. Inline SVG and emoji are fine.
2. Persistence — localStorage/cookies/IndexedDB are DISABLED in the sandbox.
   Use the built-in async API instead:
     const db = gifos.db('items');        // a named collection
     await db.put({ id, ...fields });     // add/update; omit id to auto-assign
     await db.get(id); await db.getAll(); await db.delete(id);
     db.subscribe(items => render(items)); // fires immediately and on every change
   Everything in gifos.db() saves into the app's own icon AND syncs live to
   all players when the app goes multiplayer. Keep all state there and render
   from subscribe() — that makes the app multiplayer-ready for free.
   HONESTY: there is NO cloud and NO automatic cross-device sync. Data lives
   on the user's device, inside the app's GIF in that browser. It reaches
   other devices exactly two ways: live, while people are connected through
   an invite link, or by sharing the GIF file itself (state travels inside
   the file). Never write UI copy claiming the app "syncs across your
   devices" or "backs up to the cloud" — say something true instead, like
   "Saved on this device inside the app's GIF".
3. Identity — const me = await gifos.me(); → { id, name }. Stamp me.id/me.name
   on records so moves, messages, and scores are attributed per player.
4. Degrade gracefully if window.gifos is undefined (opened outside GifOS):
   fall back to in-memory state and a default name.
5. Mobile-friendly, dark theme by default (#0a0a0f background is the OS look).
6. LIVE MEDIA IS OFF-LIMITS to apps, by design: the sandbox blocks camera,
   microphone, screen capture, and WebRTC, so a video/voice/streaming app
   CANNOT work as a GifOS app — do not attempt one. If the user asks for
   video chat, tell them GifOS already ships it: the built-in Video Call on
   their Home Screen (P2P, permanent room links, moderation, room
   passwords). Apps CAN bundle and display static media — images, GIFs,
   audio files — as files inside the GIF, and store binary blobs (base64)
   in gifos.db — but keep hot collections lean: put big blobs (over
   ~100KB) in their OWN collection, fetched with db.get(), because
   subscribers re-download a whole collection on every change, and
   relay-fallback bandwidth is strictly throttled — bloated hot
   collections make an app slow for everyone.

## Packing it into a GIF (the pack_app tool)

Call pack_app with the finished HTML. You get back a complete, valid,
animated .gif — give that file to the user; they drop it on gifos.app.

The ICON is the soul of the app — and THE USER'S OWN GIF ALWAYS COMES
FIRST. Ask whether they have a GIF they'd like to use (their own art, a
favorite meme, anything): if yes, pass its bytes as "hide_in_gif_base64"
and it is used WHOLESALE — byte-for-byte, never redrawn, re-encoded,
resized, or "improved"; the app rides inside it invisibly. Do NOT supply
an "icon" argument in that case.

Only when they have no GIF: ask what kind of cute animation they'd like,
then draw it to their description. The GifOS house style is cute STICKERS:
little characters with dark outlines on a TRANSPARENT background (they
float on the wallpaper — no background tile; use "transparent"
generously). Supply pixel art via the "icon" argument:
  "icon": {
    "palette": { ".": "transparent", "a": "#7b5cff", "b": "#ffffff" },
    "frames": [ ["..aa..", ".abba.", "..."], ["..."] ],   // 2-6 frames
    "delay_cs": 12
  }
Each frame is an array of equal-length strings (one char per pixel, 8-64 px
square works; 16 or 24 is the sweet spot — GifOS upscales crisply with
pixelated rendering). Design something that MOVES: a blinking light, a
bouncing ball, a sweeping hand. If you omit "icon", a decent procedural
animated sticker is generated from the accent color — but custom art is
what makes an app feel loved.

## Their GIF is the app (the preferred move — always offer it)

ALWAYS ask the user whether they have a GIF to use before drawing anything
— their own creation, a favorite from their camera roll, their group chat,
or the wild internet. Pass its bytes to pack_app as "hide_in_gif_base64"
and the app is spliced INSIDE that exact GIF: it still looks and animates
like the original everywhere it's shared — untouched, byte-for-byte — but
dropped on a GifOS Home Screen it RUNS. A dancing-cat GIF that's secretly
a birthday card. A meme that's secretly a game. Someone's hand-made GIF
that becomes their hand-made app. Never redraw or "improve" a GIF the
user provides; if they have none, ask what kind of cute animation they'd
like drawn.

## Modding other people's apps (ENCOURAGED — remix culture is the point)

Any GifOS app GIF can be handed to you for a REMIX: "make the buttons
bigger", "add a dark mode", "translate it", "turn this counter into a
tracker". Apps are files, files get modded, and GifOS celebrates it. Flow:
1. unpack_app with the GIF's bytes — you get the manifest, every file,
   and any saved .state/ data inside.
2. Make exactly the changes the user asked for.
3. pack_app with hide_in_gif_base64 = the ORIGINAL GIF: the app payload is
   swapped in place, the animation survives byte-for-byte, and the user's
   saved data rides along if you pass the .state/ files through unchanged
   (as extra_files) — only reset state if they ask.
A signed original comes back unsigned — a mod is a NEW work the original
author's signature can't vouch for; the modder can sign THEIR version at
${SITE}/sign.html.

## Delivering to the user

THE DELIVERABLE IS THE FINISHED .gif FILE — never hand the user raw HTML
unless they explicitly ask for source code. pack_app returns the GIF as
base64 (an embedded resource named <App>.gif) plus an inline image preview.
Save the bytes as "<App>.gif" and give the file to the user with these
instructions:
  1. Open ${SITE} (their GifOS Home Screen).
  2. Tap "+ Add" (or drag the file in) and pick the GIF.
  3. Double-click the new icon — the app runs; their data lives inside it.
  4. Press "Invite" in the app to play with friends via one link.

## Signing (provenance — mention it when the user will share the app)

The user can SIGN the finished GIF so recipients see "Signed by <their
domain>" or "Signed by <their email>" — and "Tampered" if anyone alters it.
Point them to ${SITE}/sign.html AFTER you deliver the file: domain signing
generates an Ed25519 key in their browser (public half goes to
https://<domain>/gifos.key); email signing uses their own PGP key —
Ed25519 or RSA (2048+) both work — (gpg detach-signs a statement;
recipients verify via keys.openpgp.org).
The signature excludes app state, so it stays valid in use. NEVER ask for
their private key — signing happens entirely on their side. It proves
authorship, not safety.

No account, no server, no build step. The GIF is the whole product.`;

// ---- helpers ----------------------------------------------------------------
const b64encode = gif.b64encode;

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const slugOf = (s) => String(s || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';

// Rasterize the pixel-art icon spec into codec preview frames — no canvas
// anywhere, so this runs fine in a Worker.
function iconToPreview(icon) {
  if (!icon || !Array.isArray(icon.frames) || !icon.frames.length) return null;
  const rows0 = icon.frames[0];
  if (!Array.isArray(rows0) || !rows0.length) throw new Error('icon.frames must be arrays of row strings');
  const H = rows0.length, W = String(rows0[0]).length;
  if (W < 4 || H < 4 || W > 64 || H > 64) throw new Error('icon must be between 4x4 and 64x64 pixels');
  const chars = Object.keys(icon.palette || {});
  if (!chars.length) throw new Error('icon.palette is required (char -> #hex or "transparent")');
  const colorOf = {};
  chars.forEach((ch, i) => {
    const v = icon.palette[ch];
    colorOf[ch] = (v === 'transparent' || v === 'none') ? { idx: 0 } : { idx: i + 1, rgb: hexToRgb(v) };
    if (colorOf[ch].rgb === null) throw new Error('bad color for "' + ch + '": ' + v);
  });
  const palette = new Array(256 * 3).fill(0); // index 0 = transparent
  chars.forEach((ch) => {
    const c = colorOf[ch];
    if (c.rgb) { palette[c.idx * 3] = c.rgb[0]; palette[c.idx * 3 + 1] = c.rgb[1]; palette[c.idx * 3 + 2] = c.rgb[2]; }
  });
  const frames = icon.frames.map((rows) => {
    if (rows.length !== H) throw new Error('all icon frames must have the same height');
    const idx = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const row = String(rows[y]);
      if (row.length !== W) throw new Error('all icon rows must be the same width');
      for (let x = 0; x < W; x++) {
        const c = colorOf[row[x]];
        idx[y * W + x] = c ? c.idx : 0;
      }
    }
    return idx;
  });
  const delay = Math.max(2, Math.min(100, (icon.delay_cs | 0) || 12));
  return { width: W, height: H, palette, numColors: 256, minCodeSize: 8, frames, delayCs: delay, transparentIndex: 0 };
}

// ---- tools -------------------------------------------------------------------
const TOOLS = [
  {
    name: 'get_build_guide',
    description: 'The complete guide to building a GifOS app: the sandbox rules, the gifos.db/gifos.me API, the pixel-art icon format, and how to deliver the finished GIF to the user. Read this FIRST.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'pack_app',
    description: 'Pack a finished GifOS app into a real, valid, animated .gif file. Returns the GIF as base64 (save it as "<name>.gif" for the user) plus an inline preview. PREFERRED: pass the user\'s own GIF as hide_in_gif_base64 — the app is spliced inside it and their animation is kept byte-for-byte (never redrawn). Only when they have no GIF, supply pixel-art "icon" frames drawn to their description. See get_build_guide.',
    inputSchema: {
      type: 'object',
      required: ['name', 'html'],
      properties: {
        name: { type: 'string', description: 'Human app name, e.g. "Star Tracker"' },
        html: { type: 'string', description: 'The complete self-contained index.html' },
        appId: { type: 'string', description: 'Optional slug id; derived from name if omitted' },
        accent: { type: 'string', description: 'Optional #rrggbb accent color (used for the procedural icon fallback)' },
        extra_files: { type: 'object', additionalProperties: { type: 'string' }, description: 'Optional additional text files, path -> content (app.js, style.css, data.json, …)' },
        hide_in_gif_base64: { type: 'string', description: 'PREFERRED when the user has any GIF of their own: base64 bytes of that EXISTING GIF. The app is hidden inside it and the original animation is preserved byte-for-byte — never redrawn or re-encoded. Ask the user for their GIF before drawing an icon.' },
        icon: {
          type: 'object',
          description: 'Optional pixel-art animated icon: { palette: {char: "#hex"|"transparent"}, frames: [[row strings]], delay_cs }',
          properties: {
            palette: { type: 'object', additionalProperties: { type: 'string' } },
            frames: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
            delay_cs: { type: 'integer' },
          },
        },
      },
    },
  },
  {
    name: 'unpack_app',
    description: 'Open an existing GifOS app GIF and return everything inside: manifest, every file, and any saved .state/ data. USE THIS TO MOD APPS — remixing other people\'s apps is encouraged! Flow: unpack_app → edit the files → pack_app with hide_in_gif_base64 set to the SAME original GIF (the payload swaps in place, the animation survives byte-for-byte). Pass .state/ files through unchanged to keep the user\'s data.',
    inputSchema: {
      type: 'object',
      required: ['gif_base64'],
      properties: { gif_base64: { type: 'string', description: 'Base64 bytes of the GifOS app GIF to open' } },
    },
  },
  {
    name: 'validate_app',
    description: 'Static checks on GifOS app HTML: external resource loads (blocked by the sandbox), forbidden storage APIs, missing gifos.db usage. Run before pack_app.',
    inputSchema: { type: 'object', required: ['html'], properties: { html: { type: 'string' } } },
  },
];

async function callTool(name, args) {
  args = args || {};
  if (name === 'get_build_guide') {
    return { content: [{ type: 'text', text: GUIDE }] };
  }

  if (name === 'validate_app') {
    const html = String(args.html || '');
    const problems = [];
    const ext = html.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+["']/gi) || [];
    for (const hit of ext) if (!/rel\s*=\s*["']?icon/i.test(hit)) problems.push('External resource (blocked by the sandbox): ' + hit.slice(0, 100));
    if (/\blocalStorage\b/.test(html)) problems.push('Uses localStorage — disabled in the sandbox; use gifos.db() instead.');
    if (/document\.cookie/.test(html)) problems.push('Uses document.cookie — disabled in the sandbox; use gifos.db() instead.');
    if (/\bindexedDB\b/.test(html)) problems.push('Uses indexedDB — disabled in the sandbox; use gifos.db() instead.');
    if (/@import|url\(\s*["']?https?:/i.test(html)) problems.push('CSS loads a remote resource — inline everything.');
    if (!/gifos\.db\(/.test(html)) problems.push('Note: no gifos.db() usage found — the app will not persist anything or sync in multiplayer.');
    const text = problems.length
      ? 'Issues found:\n- ' + problems.join('\n- ')
      : 'Looks good — no sandbox violations detected. Ready for pack_app.';
    return { content: [{ type: 'text', text }] };
  }

  if (name === 'unpack_app') {
    let bytes;
    try { bytes = gif.b64decode(String(args.gif_base64 || '').replace(/^data:image\/gif;base64,/, '')); }
    catch (e) { throw new Error('gif_base64 is not valid base64'); }
    const archive = await gif.decode(bytes);
    if (!archive) throw new Error('no GifOS app found inside this GIF — nothing to unpack');
    const files = archive.files;
    const signed = !!gif.findAppExtSpan(bytes, 'GIFOSSIG');
    const isText = (p) => /\.(html?|js|mjs|css|json|txt|md|svg|csv|xml)$/i.test(p);
    const paths = Object.keys(files).sort();
    const parts = [
      'Unpacked ' + paths.length + ' file(s) from this GifOS app GIF.' +
      (signed ? '\nNOTE: the original is SIGNED. A mod is a new work — repacking removes the signature; the modder can re-sign at ' + SITE + '/sign.html.' : '') +
      '\nTo deliver a MOD: edit the files, then call pack_app with hide_in_gif_base64 = this SAME original GIF (payload swaps in place; animation survives byte-for-byte). Pass .state/ files through unchanged as extra_files to keep the user\'s saved data.',
    ];
    for (const p of paths) {
      const f = files[p];
      if (isText(p)) parts.push('--- ' + p + ' ---\n' + gif.bytesToText(f));
      else parts.push('--- ' + p + ' (binary, ' + f.length + ' bytes, base64) ---\n' + b64encode(f));
    }
    return { content: [{ type: 'text', text: parts.join('\n\n') }] };
  }

  if (name === 'pack_app') {
    const appName = String(args.name || '').trim();
    const html = String(args.html || '');
    if (!appName) throw new Error('name is required');
    if (!/<[a-z][\s\S]*>/i.test(html)) throw new Error('html must be a complete HTML document');
    const slug = slugOf(args.appId || appName);
    const accent = hexToRgb(args.accent) || [123, 92, 255];

    const files = {
      'manifest.json': JSON.stringify({
        gifos: '1.0', appId: slug, name: appName, version: '1.0.0', entry: 'index.html',
        accent, capabilities: { db: true, multiplayer: true, network: [] },
      }),
      'index.html': html,
    };
    if (args.extra_files && typeof args.extra_files === 'object') {
      for (const p in args.extra_files) {
        const path = String(p).replace(/^\.?\//, '');
        if (!path || path.includes('..')) throw new Error('bad extra file path: ' + p);
        files[path] = String(args.extra_files[p]);
      }
    }

    let bytes, artNote;
    if (args.hide_in_gif_base64) {
      let host;
      try { host = gif.b64decode(String(args.hide_in_gif_base64).replace(/^data:image\/gif;base64,/, '')); }
      catch (e) { throw new Error('hide_in_gif_base64 is not valid base64'); }
      bytes = await gif.embed(host, files);
      artNote = 'hidden inside the supplied GIF — its original animation is untouched';
      // A remix is a new work: the original author's signature can't vouch for
      // modified files and would render as "Tampered" — strip it instead. The
      // modder can sign their own version.
      const sig = gif.findAppExtSpan(bytes, 'GIFOSSIG');
      if (sig) {
        const cut = new Uint8Array(bytes.length - (sig.end - sig.start));
        cut.set(bytes.subarray(0, sig.start), 0);
        cut.set(bytes.subarray(sig.end), sig.start);
        bytes = cut;
        artNote += '; the original signature was removed — a mod is a new work, re-signable at ' + SITE + '/sign.html';
      }
    } else {
      const preview = iconToPreview(args.icon);
      let seed = 0;
      for (let i = 0; i < slug.length; i++) seed = (seed * 31 + slug.charCodeAt(i)) >>> 0;
      bytes = await gif.encode(files, { accent, preview, seed });
      artNote = preview ? preview.frames.length + ' custom icon frames' : 'procedural animated icon';
    }
    const b64 = b64encode(bytes);
    const fileName = appName.replace(/[\\/:*?"<>|]/g, '') + '.gif';

    return {
      content: [
        {
          type: 'text',
          text: 'Packed "' + appName + '" into a GifOS app GIF (' + bytes.length + ' bytes, ' + artNote + ').\n' +
            'Save the embedded resource below as "' + fileName + '" and give it to the user with these steps:\n' +
            '1. Open ' + SITE + '  2. Tap "+ Add" and pick the GIF (or drag it in)  3. Double-click the icon to run it.\n' +
            'The image content below is the actual file — it animates because the app GIF is a real GIF.',
        },
        { type: 'image', data: b64, mimeType: 'image/gif' },
        { type: 'resource', resource: { uri: 'gifos://apps/' + slug + '.gif', name: fileName, mimeType: 'image/gif', blob: b64 } },
      ],
    };
  }

  throw new Error('unknown tool: ' + name);
}

// ---- JSON-RPC / MCP plumbing --------------------------------------------------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, mcp-session-id, mcp-protocol-version',
};
const json = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200, headers: Object.assign({ 'content-type': 'application/json' }, CORS),
});

async function handleRpc(msg) {
  if (!msg || msg.jsonrpc !== '2.0') return { error: { code: -32600, message: 'invalid request' }, id: null };
  const { method, params, id } = msg;
  if (id === undefined || id === null) return null; // notification — ack silently
  try {
    if (method === 'initialize') {
      return { jsonrpc: '2.0', id, result: {
        protocolVersion: (params && typeof params.protocolVersion === 'string') ? params.protocolVersion : PROTOCOL_FALLBACK,
        capabilities: { tools: {} },
        serverInfo: { name: 'gifos', title: 'GifOS app builder', version: '1.0.0' },
        instructions: 'Build finished GifOS apps: call get_build_guide first, write the self-contained HTML, design 2-6 frames of pixel-art icon animation, then pack_app to get the real .gif file for the user.',
      } };
    }
    if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
    if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    if (method === 'tools/call') {
      try {
        const result = await callTool(params && params.name, params && params.arguments);
        return { jsonrpc: '2.0', id, result };
      } catch (e) {
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Error: ' + (e.message || e) }], isError: true } };
      }
    }
    if (method === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: [] } };
    if (method === 'prompts/list') return { jsonrpc: '2.0', id, result: { prompts: [] } };
    return { jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } };
  } catch (e) {
    return { jsonrpc: '2.0', id, error: { code: -32603, message: String(e.message || e) } };
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (request.method === 'GET') {
      return new Response(
        'GifOS MCP server — lets your AI build finished GifOS apps (real .gif files).\n' +
        'Connect your MCP client to: ' + url.origin + '/mcp\n' +
        'Docs: ' + SITE + '/llms.txt\n',
        { status: 200, headers: Object.assign({ 'content-type': 'text/plain' }, CORS) });
    }

    if (request.method !== 'POST' || (url.pathname !== '/mcp' && url.pathname !== '/')) {
      return json({ jsonrpc: '2.0', error: { code: -32600, message: 'POST JSON-RPC to /mcp' }, id: null }, 404);
    }

    let body;
    try { body = await request.json(); } catch (e) {
      return json({ jsonrpc: '2.0', error: { code: -32700, message: 'parse error' }, id: null }, 400);
    }

    if (Array.isArray(body)) {
      const replies = (await Promise.all(body.map(handleRpc))).filter(Boolean);
      return replies.length ? json(replies) : new Response(null, { status: 202, headers: CORS });
    }
    const reply = await handleRpc(body);
    return reply ? json(reply) : new Response(null, { status: 202, headers: CORS });
  },
};
