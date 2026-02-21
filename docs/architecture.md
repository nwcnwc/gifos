# GifOS Architecture

## Overview

GifOS has three layers, all represented as plain files:

1. **The Shell** — `index.html` — the universal runtime
2. **App GIFs** — encoded applications
3. **Data GIFs** — encoded save states

## The Shell (`index.html`)

The shell is the only "installed" component. It's a single HTML file that:

- Renders a drop zone for GIF files
- Decodes App GIFs into runnable applications
- Decodes Data GIFs into application state
- Provides the runtime environment (virtual filesystem, database, state management)
- Manages the encode/decode pipeline for saving and loading

### Shell Components (all inline)

| Component | Purpose | Size Est. |
|-----------|---------|-----------|
| GIF Encoder | Write GIF89a files with data in extension blocks + pixel frames | ~5KB |
| GIF Decoder | Read GIF89a files, extract extension blocks + pixel data | ~3KB |
| State Manager | Serialize/deserialize IndexedDB + virtual FS + app state | ~5KB |
| Compression | pako.js (deflate/inflate) | ~28KB |
| Canvas Renderer | Generate human-readable preview frames | ~3KB |
| QR Generator | QR codes for the visual frame | ~10KB |
| App Runtime | Sandbox for running decoded app code | ~10KB |
| **Total Shell** | | **~65KB** |

## GIF Format: How Data is Stored

### GIF89a Structure

```
GIF Header
├── Logical Screen Descriptor
├── Global Color Table
├── Frame 1: Human-Readable Preview
│   ├── App name, icon, description
│   ├── Save date, record count
│   ├── QR code (link to shell/app)
│   └── Preview thumbnail
├── Application Extension Block: "GIFOS1.0"
│   ├── Type flag: APP or DATA
│   ├── Version
│   ├── Compressed payload (chained 255-byte sub-blocks)
│   │   └── Deflated JSON of app code or state
│   └── Checksum
├── Frame 2+: Pixel-Encoded Backup Data
│   └── RGB values encode bytes (192KB per 256x256 frame)
└── GIF Trailer
```

### App GIF Payload

```json
{
  "gifos": "1.0",
  "type": "app",
  "appId": "crm",
  "name": "Simple CRM",
  "version": "1.0.0",
  "description": "A customer relationship manager",
  "icon": "<base64 png>",
  "code": {
    "html": "<div id='app'>...</div>",
    "css": "body { ... }",
    "js": "(function() { ... })()"
  },
  "schema": {
    "databases": [
      {
        "name": "crm",
        "stores": {
          "contacts": { "keyPath": "id", "autoIncrement": true },
          "deals": { "keyPath": "id", "autoIncrement": true }
        }
      }
    ]
  },
  "defaultData": { ... },
  "permissions": ["filesystem", "camera", "clipboard"]
}
```

### Data GIF Payload

```json
{
  "gifos": "1.0",
  "type": "data",
  "appId": "crm",
  "appVersion": "1.0.0",
  "savedAt": "2026-02-20T23:30:00Z",
  "state": {
    "indexedDB": {
      "crm": {
        "contacts": [...],
        "deals": [...]
      }
    },
    "virtualFS": {
      "/attachments/contract.pdf": "<base64>",
      "/photos/headshot.jpg": "<base64>"
    },
    "appState": {
      "currentView": "dashboard",
      "filters": { "status": "active" },
      "preferences": { "theme": "dark" }
    }
  }
}
```

## Encoding Pipeline (Save)

```
App State
    │
    ▼
Serialize (IndexedDB + FS + state → JSON)
    │
    ▼
Compress (pako deflate)
    │
    ▼
Split into 255-byte sub-blocks
    │
    ├──→ Write to GIF Application Extension ("GIFOS1.0")
    │
    ▼
Render preview frame (Canvas → pixel data)
    │
    ├──→ Frame 1: Human-readable info
    │
    ▼
Optionally encode backup in pixel frames
    │
    ├──→ Frame 2+: RGB-encoded data
    │
    ▼
Assemble GIF89a file
    │
    ▼
Download as .gif
```

## Decoding Pipeline (Load)

```
User drops .gif file
    │
    ▼
Parse GIF89a structure
    │
    ▼
Find "GIFOS1.0" Application Extension
    │
    ├── Found? → Reassemble sub-blocks → Decompress → Parse JSON
    │
    └── Not found? → Try pixel-decoding Frame 2+ (backup path)
    │
    ▼
Check type: "app" or "data"
    │
    ├── App? → Load code into runtime sandbox
    │           Create IndexedDB schema
    │           Load default data (if any)
    │
    └── Data? → Check appId matches loaded app
                Hydrate IndexedDB
                Restore virtual FS
                Restore app state
```

## Security Considerations

- App code runs in a sandboxed iframe
- Data GIFs are validated against the app's schema before loading
- No network access by default (apps must request permissions)
- The shell validates GIF structure and checksums before decoding

## Size Limits

| Scenario | GIF Size | Capacity |
|----------|----------|----------|
| Simple app, no data | ~50-100KB | Just code |
| App + moderate data | ~500KB-2MB | Thousands of records |
| App + files/images | 2-10MB | Documents, photos |
| Practical max | ~50MB | Large datasets |

GIF has no hard size limit. Practical limit is what platforms will transmit/display.

## Future Considerations

- **App Store** — gifos.app as a directory of App GIFs
- **Versioning** — Multiple versions of an app, backward-compatible data loading
- **Collaboration** — Merge two Data GIFs (like git merge for app state)
- **Encryption** — Password-protected Data GIFs
- **Streaming** — Progressive loading of large GIFs
