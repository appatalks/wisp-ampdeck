# Wisp AmpDeck Technical Guide

Development, architecture, packaging, and release notes for Wisp AmpDeck.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- Linux or macOS

## Development

Install dependencies and start Vite with Electron:

```bash
npm install
npm run dev
```

Build the renderer and run it in Electron:

```bash
npm run build
npm start
```

## Architecture

Wisp AmpDeck uses:

- Electron for the native borderless window, dialogs, local file access, and packaging
- Vite for the renderer build
- Webamp for the classic player, playlist, equalizer, skins, and audio controls
- music-metadata for on-demand tags and technical song information
- electron-builder for Linux and macOS artifacts

The renderer runs with context isolation enabled, Node integration disabled, and Electron sandboxing enabled. Privileged operations are exposed through the preload bridge.

Local files are registered behind the `ampdeck-audio:` protocol. The protocol supports CORS and byte-range responses so Chromium can seek and decode local tracks. File mappings, the selected skin, and interface scale persist between sessions.

On Linux, the transparent host window contracts around visible Webamp modules. It expands temporarily for detached-window movement, menus, Settings, and Song Information.

## Packaging

Build Linux artifacts:

```bash
npm run dist:linux
```

This creates:

- A portable AppImage in `dist/`
- An installer ZIP in `release/`
- Stable AppImage and icon assets for the one-line installer

Build macOS artifacts on macOS:

```bash
npm run dist:mac
```

The macOS build produces a DMG and ZIP. Public macOS releases should be signed and notarized.

## Releases

Push a version tag matching the version in `package.json`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow builds Linux x86-64 artifacts and uploads the stable filenames consumed by `install.sh`.

The public installer command works after `install.sh` is present on `main` and at least one tagged release has published these assets:

- `Wisp-AmpDeck-linux-x86_64.AppImage`
- `wisp-ampdeck.png`

## Project Layout

- `electron/`: main process and preload bridge
- `src/`: renderer behavior and styles
- `scripts/`: installer, uninstaller, and release helpers
- `build/`: application icon sources
- `.github/workflows/`: release automation
- `dist/`: generated application builds
- `release/`: generated installer assets
