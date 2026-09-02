# Security

GifOS runs untrusted app GIFs next to a person's own data, so a real
boundary crossing is the highest-severity bug this project has.
[docs/threat-model.md](docs/threat-model.md) says what is defended, how, and
what is deliberately not.

## Reporting

Found something that crosses a boundary the threat model claims is closed?
Open an issue, or contact the maintainer privately for anything sensitive,
with the app GIF or a reproduction. The two classes that matter most:

- **Boundary A** — an app escaping its sandbox: reaching the parent page,
  another app's data, cookies or storage.
- **Boundary B** — an app reaching the network by any path but the
  manifest-gated bridge, or reaching a first-party origin through it.

A signature on an app proves who made it, never that it is safe; a report
about a signed app is still a report.

## What is in scope

- `site/` — the shell, the runtime, the sandbox bridge, the desktop store.
- `relay/`, `cors-proxy/`, `mirror/`, `pay/` — the Cloudflare Workers.
- `scripts/` and `.github/workflows/` — the release and publishing path.

Vendored app code under `apps/*/vendor` is upstream software; a bug there is
best reported upstream, unless the port itself widens what it can do.
