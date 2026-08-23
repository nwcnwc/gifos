# Restfox

An unofficial port of **[Restfox](https://github.com/flawiddsouza/Restfox)**
(Flawid D'Souza, MIT) as a sandboxed GifOS HTTP client.

Restfox's `packages/web-standalone` is **not** a browser build: it is an
Express server that serves the Vue UI and **proxies** HTTP so the browser never
has to. There is no Node in a GIF, and the sandbox CSP is `connect-src 'none'`,
so that path cannot come along. This directory is the GifOS surface: the
collection model (folders, requests, env vars, Restfox-1.0.0 import/export),
with every Send going through `gifos.fetch`.

Finished GIF: [`site/apps/restfox/restfox.gif`](../../site/apps/restfox/restfox.gif).
Rebuild with `node apps/restfox/build.mjs`, then
`node scripts/build-app-catalog.mjs`.

## What it uses from GifOS

| capability | why |
|---|---|
| `network: ["*"]` | An HTTP client has to aim at whatever host you type. GifOS labels that ⚠ Unsafe and you confirm (or revoke) hosts before it talks. |
| `db` | Collections, environments, and the last response per request, all **private** in `gifos.db`. |

There is no other way out of the sandbox. `Host.fetch` is `gifos.fetch` inside
GifOS and plain `fetch` only in the static-file dev host.

## Honest limits

- **Requests leave when you send them.** Collections stay on this device.
- **https only** (localhost `http` is the runtime exception). 8 MB response cap.
- **Same CORS limit as Restfox in a browser.** Restfox's desktop/web-standalone
  proxy is not here. A checkbox can route through GifOS's CORS proxy, which
  only forwards to a curated public-host list — not arbitrary APIs.
- **No cookies** (`credentials: 'omit'`).
- **No WebSockets, no plugins.** The sandbox has no `connect-src` and no eval.
- **No file workspaces.** Restfox's Node-side `/api/*` collection store is
  replaced by `gifos.db`.

## Layout

```
host.js     gifos-or-dev: fetch + db
app.js      collection, editor, Send, Restfox-1.0.0 import/export
style.css   Restfox dark theme (method colours, purple Send)
icon.mjs    the fox-ear card
build.mjs   packs the GIF
```

## Licences

MIT, Flawid D'Souza. The notice rides **inside** the GIF as
`COPYING-restfox.txt` as well as living here.
