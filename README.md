# Motif

A local-first music player and discovery PWA.

Motif plays music directly from your device using the File System Access API. Your library stays on your computer—no uploads, subscriptions, or cloud syncing required.

## Features

- Local folder scanning
- Fast library management with IndexedDB
- Metadata and album artwork extraction
- Offline lyrics support (`.lrc` + embedded tags)
- Queue, shuffle, repeat, playback speed, and Media Session controls
- Fuzzy search across your library
- Virtualized lists for large collections
- Responsive mobile-first interface
- Sample tracks for testing without importing a library

## Tech Stack

- React
- Vite
- IndexedDB
- File System Access API
- `music-metadata`

## Getting Started

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

> **Note:** Chrome and Edge are currently required. Firefox and Safari do not yet support the File System Access API.

## Project Structure

```text
src/
  audio/        Playback engine
  components/   Shared UI
  db/           IndexedDB
  library/      File scanning & metadata
  search/       Search engine
  state/        Global state
  views/        Application screens
```

## Roadmap

Planned improvements include:

- Artist, Album, and Genre views
- Playlist management
- Discovery and recommendations
- Gapless playback and crossfade
- Equalizer and audio enhancements
- Additional UI polish

## License

MIT
