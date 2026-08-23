# Restfox

An HTTP client. Build a collection of requests, press **Send**, and read the answer.

Collections stay on this device. A request leaves this browser only when you press Send, and only to hosts you have allowed. This app talks nowhere Abilities have not granted.

## Collection

The left list is folders and requests. **+ Request** and **+ Folder** add to it. Filter searches names and URLs. Long-press a row (or right-click) to rename, duplicate, or delete.

The **⋯** menu:

- **Export JSON** — a Restfox-1.0.0 collection you can save
- **Import JSON** — paste or pick a file
- **Import curl** — one `curl` command (`-X`, `-H`, `-d`; other flags are ignored)

First launch seeds a few example requests so Send has somewhere to go.

On a phone, **☰** opens the list.

## A request

Pick a method and a URL, then **Send**. Enter also sends, as does Ctrl+Enter / ⌘Enter.

Tabs on the request:

- **Query** — `?name=value` pairs
- **Headers**
- **Body** — none, JSON, text, or form-encoded
- **Auth** — none, Basic (user and password), or Bearer (token)

**Env** holds `NAME=value` lines. Write `{{NAME}}` in the URL, headers, or body and Send substitutes them. The dropdown picks which environment is live.

**CORS proxy** only helps for hosts on a public allow-list — not arbitrary APIs. Leave it off unless you know the host is on that list.

The response shows status, time, size, body, and headers. JSON is pretty-printed when it can be. The last answer per request is kept with the collection (long bodies are trimmed).

## What Send will not do

- Talk to a host you have not allowed. This app asks to reach any site, so the tab labels it **Unsafe** until you confirm hosts. Untick one and that host is gone.
- Plain `http`, except localhost. Responses cap at 8 MB.
- Attach cookies. There are no live sockets, no plugins, and no file workspaces.
- Bypass a site that refuses the browser (CORS). Restfox on the desktop uses its own proxy for that; this copy does not. A refused call is the browser blocking it, not Send being broken.

## Private

Collections, environments, and last responses stay in this file. **Invite** does not share them.

Unofficial port of [Restfox](https://github.com/flawiddsouza/Restfox) by Flawid D'Souza.
