# gifos-mcp

An MCP (Model Context Protocol) server that lets any AI assistant build
**finished GifOS apps** — real `.gif` files with the app inside and an
animated icon — directly in a conversation.

The flow a user experiences:

> "Hey Claude, build me a habit tracker for GifOS."

1. Claude calls **`get_build_guide`** → learns the sandbox rules, the
   `gifos.db()` / `gifos.me()` API, and the pixel-art icon format.
2. Claude writes the self-contained `index.html` and designs 2–6 frames of
   pixel-art icon animation.
3. Claude calls **`validate_app`** → static checks for sandbox violations
   (CDN loads, localStorage, remote CSS…).
4. Claude calls **`pack_app`** → gets back a complete, valid, animated GIF
   (base64 + inline preview), saves it as `Habit Tracker.gif`, and hands the
   file to the user with install steps (gifos.app → ＋ Add).

**Stateless by design.** `pack_app` is a pure function from inputs to GIF
bytes — nothing is stored, logged, or hosted. It runs the exact same codec
the desktop uses (`site/js/gifos-gif.js`); Workers provide the needed
`CompressionStream`/`TextEncoder` natively, and the pixel-art icon path
needs no canvas.

## Connect (users)

- **Claude (web/desktop):** Settings → Connectors → *Add custom connector* →
  `https://mcp.gifos.app/mcp`
- **Claude Code:** `claude mcp add --transport http gifos https://mcp.gifos.app/mcp`

Discovery pointers for AIs that merely *browse* gifos.app:
[`site/llms.txt`](../site/llms.txt) (the full build spec — enough to produce
paste-into-＋Add apps with no MCP at all) and
[`site/.well-known/mcp.json`](../site/.well-known/mcp.json).

## Deploy

```bash
cd mcp
npx wrangler deploy
```

`wrangler.toml` binds **both** a custom domain (`mcp.gifos.app` — DNS + TLS)
and an explicit zone route (`mcp.gifos.app/*`). Both are required: Cloudflare
routes beat custom domains, and the gifos-mirror Worker holds a
`*.gifos.app/*` wildcard route that would otherwise swallow this hostname
(the mirror fails loudly with a 530 if that ever happens).

Verify: `curl https://mcp.gifos.app/` → a plain-text pointer, and
`node test/mcp-server.js` runs the full protocol + packing round-trip locally.

## Protocol notes

Streamable-HTTP MCP, JSON-RPC over `POST /mcp`, plain JSON responses, no
sessions, no auth (all tools are public and read-only-plus-pure-compute).
Implements `initialize`, `ping`, `tools/list`, `tools/call`, and returns
empty lists for `resources/list` / `prompts/list`.
