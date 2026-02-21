# GifOS

**Your GIF-powered operating system.**

> One HTML shell. Apps are GIFs. Data is GIFs. Everything is just files.

🌐 [gifos.app](https://gifos.app)

## What is GifOS?

GifOS is a radical rethinking of how software works:

- **The Shell** (`index.html`) — A universal runtime that loads and runs applications
- **App GIFs** — Applications encoded as GIF images. Drop one onto the shell and it runs.
- **Data GIFs** — Save files encoded as GIF images. Like `.doc` is to Word, Data GIFs are to App GIFs.

No servers. No accounts. No installs. Just files.

## How It Works

```
shell.html + crm-app.gif                    = A CRM application
shell.html + crm-app.gif + my-clients.gif   = A CRM with your data loaded
shell.html + spreadsheet.gif + q4-budget.gif = A spreadsheet with your budget
```

### The Three Layers

```
┌─────────────────────────────────────────────┐
│           shell.html (THE RUNTIME)           │
│                                              │
│   Drop an App GIF to load an application     │
│   Drop a Data GIF to restore your state      │
│                                              │
├──────────────────────┬───────────────────────┤
│     App GIF 📦       │     Data GIF 💾        │
│                      │                        │
│  Contains:           │  Contains:             │
│  • Application code  │  • IndexedDB state     │
│  • UI definition     │  • Virtual filesystem  │
│  • Default config    │  • User preferences    │
│                      │                        │
│  Viewable as:        │  Viewable as:          │
│  • App icon/preview  │  • Save info + preview │
│  • Description text  │  • Record count, date  │
│  • QR code to shell  │  • QR code to app      │
└──────────────────────┴───────────────────────┘
```

### Why GIFs?

GIF is the perfect container format:
- **Universal** — every platform displays GIFs natively
- **Multi-frame** — Frame 1 is a human-readable preview; remaining frames store encoded data
- **Metadata support** — Application Extension blocks can store arbitrary data
- **Shareable** — Send via chat, email, social media. It looks like an image because it IS an image.
- **Durable** — No one strips GIFs. They survive every platform.

### The Magic

Someone sends you a GIF in a group chat. It looks like an app screenshot. But drag it onto `shell.html` and it **becomes** that app, loaded with their data. 

Share your work by sharing a GIF. Fork someone's project by loading their GIF. It's git for normal people.

## Getting Started

```bash
# Clone the repo
git clone https://github.com/nwcnwc/gifos.git

# Open the shell in your browser
open index.html

# Drop any App GIF onto the shell to get started
```

## Project Status

🚧 **Early development** — Building the proof of concept.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full technical design.

## License

TBD — Patent pending concepts. See [LICENSE](LICENSE) for details.
