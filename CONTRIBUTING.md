# Contributing to GifOS

There are two very different ways to contribute, and they need very different
amounts of setup:

- **[Build an app](#build-an-app-no-setup-required)** — no dev environment, no
  clone, no permission from anyone. Most contributions should be apps.
- **[Work on the operating system itself](#contribute-to-the-operating-system)**
  — the desktop, the sandbox, the meeting mesh, the relay. This one wants a
  real development environment, described in detail below.

(There is a third door — **send a theme**, one folder under
[`site/themes/`](site/themes), and if it's beautiful it gets its own
subdomain. See ["Every Computer Has Its Own Theme"](README.md#every-computer-has-its-own-theme-and-you-can-build-one)
in the README.)

Everything in this repo is public — the code, the commit messages, the deployed
pages. Contributions are accepted under Apache-2.0 (inbound = outbound; see
[LICENSE](LICENSE)).

## Build an app (no setup required)

A GifOS app is **one `.gif` file**, and the whole format is a public spec:
[`gifos.app/llms.txt`](https://gifos.app/llms.txt) ([`site/llms.txt`](site/llms.txt)
in this repo) — the packing recipe, the manifest, and the complete
`window.gifos` API in one document written to be handed to an AI.

The easiest path is exactly that: **point any code-capable AI at `llms.txt` and
describe your app** — *"build me a habit tracker for GifOS"* — and it comes
back with a finished `.gif` you drop on your Home Screen. **Remixing is just as
welcome as building new**: hand any existing GifOS app GIF to an AI — *"add a
dark mode"*, *"make the buttons bigger"* — and the recipe (packed inside most
app GIFs already) splices your changes into the same GIF, animation and saved
data intact. And if you'd rather write every line yourself, `llms.txt` is the
complete reference for humans too.

Shipping needs nobody's approval: host the GIF anywhere with CORS and the link
`https://gifos.app/?run=<url-to-your-gif>` runs it for anyone, in a sandbox, in
about a second. Want it in the App Store catalog? A listing is a pull request —
one folder under `apps/<slug>/` — and the full contributor doc is
[`apps/README.md`](apps/README.md).

## Contribute to the operating system

The OS is a static site (no build step, no framework) plus a handful of tiny
stateless Workers:

| piece | where | what it is |
|---|---|---|
| `site/` | gifos.app | the whole OS: desktop, sandbox runtime, meeting mesh, themes |
| `relay/` | relay.gifos.app | the WebSocket greeter/door for multiplayer (Cloudflare Worker) |
| `mirror/`, `cors-proxy/`, `pay/` | *.gifos.app | subdomain computers, the CORS proxy, payments |
| `apps/` | gifos.app/store | App Store sources (one folder per listed app) |
| `test/` | — | 250+ standalone suites; [`test/README.md`](test/README.md) is the index |
| `docs/` | — | architecture, the mesh, security doctrine |

Because `site/` is plain static files, the core loop is: edit a file, refresh
the browser. What differs between contributors is the **testing topology** —
multiplayer and meetings are peer-to-peer between real browsers, so the
question is how many real devices you can put on your dev build. Two setups
are described below: everything on one home computer, and a home computer plus
a personal server with a domain.

### What you need (both setups)

- **git**, and **Node.js 18+** (22 recommended — the test servers and suites
  are dependency-free Node scripts).
- **Python 3** (only for `python3 -m http.server`; any static server works).
- Optional, for the browser test suites: **Playwright + Chromium** —
  `npm install playwright && npx playwright install chromium` in the repo root
  ([`test/lib/pw.js`](test/lib/pw.js) finds the repo's own `node_modules` and
  `~/.cache/ms-playwright` automatically).
- Optional, for the mesh reference sim: **g++**.

### Setup 1: just a home computer

This is a complete development environment. `localhost` counts as a secure
origin in every browser, so camera, microphone, WebCrypto, and therefore
meetings and signed apps all work over plain `http://127.0.0.1`.

**1. Clone and start the dev stack.**

```bash
git clone https://github.com/nwcnwc/gifos.git
cd gifos
test/servers/dev.sh          # site on :8099 + local relay on :8790
```

[`test/servers/dev.sh`](test/servers/dev.sh) serves `site/` on
`http://127.0.0.1:8099` and runs [`test/servers/relay-local.js`](test/servers/relay-local.js)
— a dependency-free stand-in that speaks the exact protocol of the production
relay Worker — on `ws://127.0.0.1:8790`. (`--all` adds the fake AI/key/CORS
servers some suites want; Ctrl-C tears everything down.)

**2. Point your dev site at your dev relay.** The site defaults to the
production relay (`wss://relay.gifos.app`). Override it per browser, either in
**Settings → Advanced → relay** on the desktop, or in the console:

```js
localStorage.setItem('gifos_relay', 'ws://127.0.0.1:8790');
```

**3. Open `http://127.0.0.1:8099/index.html`.** The desktop seeds itself with
the default apps on first run.

**4. Multiplayer, alone.** Two browser windows are two peers. Open an app,
press **Invite**, paste the link into a second window (a different profile or
a private window gives you a genuinely separate identity). Same for meetings.
The browser suites in `test/drills/` and `test/browser/` do exactly this with
Playwright, many browsers at once.

**5. Run the tests.** Every suite is a standalone script — `node
test/unit/node-roundtrip.js`, `node test/browser/e2e.js` (needs the dev stack
from step 1), and so on. `test/unit/` needs nothing at all.
[`test/README.md`](test/README.md) is the full index of what each directory
needs.

**The honest limits of one box.** First, a phone on your LAN loading
`http://<your-computer-ip>:8099` is an **insecure origin**: the browser
withholds camera, mic, and `crypto.subtle` (and Ed25519 signing is mandatory
at every meeting join), so meetings won't work from that phone. (Escape hatch
for a phone you control: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.)
Second, timing: with the host, every guest, and the relay all scheduled on one
kernel, you cannot tell a product bug from a busy machine. Both limits are
what Setup 2 removes.

### Setup 2: home computer + a personal server (AWS, `mydomain.com`)

Add one small server with a domain and your dev build becomes reachable by
**real devices over real networks**: your phone on cellular, a friend's
laptop, real NATs and firewalls — with a genuine HTTPS origin, so meetings,
camera, and signing all work everywhere. You still develop at home exactly as
in Setup 1; the server is your test deployment.

The shape: the server serves your `site/` checkout over **HTTPS** at
`mydomain.com`, and runs the local relay behind **WSS** at
`relay.mydomain.com`. [Caddy](https://caddyserver.com) does all the TLS
(automatic certificates) and proxies WebSockets natively, so the whole thing
is two config blocks.

**1. The server.** Any small EC2 instance runs this comfortably — a
`t3.micro` on Ubuntu is plenty (the site is static files; the relay is a
greeter that carries no media). Give it an Elastic IP so the address survives
restarts. In the instance's security group, open **80** and **443** to the
world and **22** to your own IP.

**2. DNS.** At your registrar, point two records at the instance's IP:

```
A  mydomain.com        →  <elastic-ip>
A  relay.mydomain.com  →  <elastic-ip>
```

**3. Install Node, Caddy, and the repo.** On the server (Ubuntu's `nodejs`
apt package ships without npm — use the tarball):

```bash
curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz \
  | sudo tar -xJ -C /usr/local --strip-components=1
sudo apt-get install -y git caddy
git clone https://github.com/<you>/gifos.git ~/gifos   # your fork
```

**4. Caddy: the site + the relay door.** `/etc/caddy/Caddyfile`:

```
mydomain.com {
    root * /home/ubuntu/gifos/site
    file_server
}

relay.mydomain.com {
    reverse_proxy 127.0.0.1:8790
}
```

`sudo systemctl reload caddy`. Caddy fetches certificates on its own; the
relay block upgrades WebSockets automatically, so `wss://relay.mydomain.com`
terminates TLS at Caddy and forwards plain `ws` to the relay on localhost.

**5. Run the relay as a service.** `/etc/systemd/system/gifos-relay.service`:

```ini
[Unit]
Description=GifOS dev relay
After=network.target

[Service]
User=ubuntu
ExecStart=/usr/local/bin/node /home/ubuntu/gifos/test/servers/relay-local.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now gifos-relay
```

(`relay-local.js` binds `127.0.0.1:8790` by default — exactly right behind
Caddy. It can also serve WSS itself via `RELAY_TLS_CERT`/`RELAY_TLS_KEY` if
you'd rather skip the proxy for the relay.)

**6. Point the served site at your relay.** In the **server's** checkout,
edit [`site/js/relay-config.js`](site/js/relay-config.js):

```js
window.GIFOS_RELAY = 'wss://relay.mydomain.com';
```

so every device that visits `mydomain.com` uses your relay with no per-device
setup. Keep that one-line edit out of any pull request (leave it uncommitted,
or on a local branch on the server).

**7. The loop.** Develop at home against `127.0.0.1:8099` as in Setup 1. When
you want real devices on a change, push to your fork and `git pull` on the
server (or `rsync site/` straight over for a quicker iteration) — it's static
files, so the pull *is* the deploy. Then open `https://mydomain.com` on your
phone, send a friend a meeting link, and watch your change survive the real
internet.

**Production-shaped alternative.** The real relay is a Cloudflare Worker, and
its free tier covers a dev deployment: [`relay/README.md`](relay/README.md)
walks through `wrangler deploy` and pointing `relay-config.js` at your own
`workers.dev` (or your zone). Pair it with GitHub Pages on your fork and you
have the exact production topology with no server at all — at the cost of a
slower deploy loop and no box of your own to instrument. The AWS setup above
is usually the better dev experience; this one is the better final check for
relay changes (the Durable Object behaves differently from any local
stand-in — `test/servers/relay-dev.sh` runs the real Worker locally under
`wrangler dev` for exactly that reason).

### Before you send a change

- **Green or it doesn't ship.** Run the suites that cover what you touched —
  [`test/README.md`](test/README.md) maps every directory to its
  prerequisites, and `test/unit/` is free to run always. A red test is a
  finding, not a footnote; never soften an assertion to make it pass.
- **Some committed files are generated.** The App Store catalog
  (`node scripts/build-app-catalog.mjs`) and the browser-support table
  (`node scripts/build-browser-support.mjs`) are regenerated, never
  hand-edited — each has a `--check` that fails on drift.
- **`site/versions/` is frozen.** Those are archived releases; never edit them.
- **Commit messages state the change**: what moved, the constraint that forced
  it, the test result. They're rendered on the open web, so no machine names
  or private addresses — describe hardware by role and facts, not nameplates.
- Open a pull request against `main`. Small, focused PRs with the motivating
  test land fastest.
