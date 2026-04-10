# VideoSquash

Native macOS app for compressing video files. Drag & drop, pick a preset or tweak settings manually, done — no terminal required.

Built with Electron + ffmpeg. Binaries are bundled inside the app, so no extra software needs to be installed.

---

## Why

A 60 MB screen recording → 28 MB with one ffmpeg command. That works, but opening a terminal every time is tedious. VideoSquash wraps that into a simple UI.

---

## Features

- Drag & drop or file picker (mp4, mov, mkv, avi, webm, m4v, 3gp)
- Batch processing — multiple files at once, each with a progress bar
- Quick presets: **Email**, **YouTube**, **Archive**, **Mobile**
- Custom settings: quality (CRF), resolution, codec (H.264 / H.265 / VP9), speed preset
- Before/after file size comparison with % saved
- Open in Finder after compression
- Settings persist between sessions
- Dark macOS-style UI

---

## Requirements

- macOS (Apple Silicon or Intel)
- Node.js 18+ and npm (for running from source)

---

## Run from source

```bash
git clone https://github.com/nikos83/video-squash.git
cd video-squash
npm install
npm start
```

---

## Build a distributable .dmg

```bash
npm run build
```

Output goes to `dist/`. Requires an `assets/icon.icns` file to be present.

---

## Tests

```bash
npm test
```

Coverage report:

```bash
npm run test:coverage
```

---

## Stack

| Layer | Technology |
|---|---|
| App shell | Electron |
| Video compression | fluent-ffmpeg + ffmpeg-static |
| Packaging | electron-builder |
| UI | Vanilla JS + CSS (no framework) |

ffmpeg and ffprobe binaries are bundled via `ffmpeg-static` and `ffprobe-static` — the user does not need to install anything extra.

---

## Project structure

```
video-squash/
├── main.js          # Electron main process, IPC handlers, compression queue
├── preload.js       # contextBridge — safe bridge between main and renderer
├── lib/
│   └── compressor.js  # fluent-ffmpeg wrapper (compress, getFileInfo, cancel)
├── src/
│   ├── index.html   # App shell
│   ├── renderer.js  # All UI logic — state, queue, settings, rendering
│   └── styles.css   # Dark macOS-style theme
├── tests/           # Jest unit tests
└── assets/          # App icon (icon.icns)
```

---

## License

MIT
