# Motif — Local-First Music Player & Discovery PWA

Your library, not a subscription. Motif reads music straight from your device's
file system — nothing is uploaded, copied, or streamed from a server you don't
control.

## Status: Priorities 1–2 (stable playback + library management) implemented, 3 (search) started

This is a working vertical slice, not a full build of the spec — see
"What's next" below for what's deliberately deferred and why.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

Requires **Chrome or Edge** (desktop or Android) — Motif depends on the File
System Access API, which Safari and Firefox don't support yet. The app
detects this and shows a message rather than failing silently.

```bash
npm run build     # production build, output in dist/
npm run preview   # serve the production build locally
```

To actually test playback you need a folder of MP3/FLAC/WAV/OGG/OPUS/AAC/M4A
files on disk — connect one from the Home screen or Settings.

## What's implemented

**Library**
- Recursive folder scanning via the File System Access API
- Metadata extraction (title/artist/album/albumArtist/track/disc/genre/year/
  duration/bitrate/sample rate/embedded artwork) via `music-metadata`
- Change detection by size + `lastModified` — unchanged files are never
  re-parsed, so rescans of a large library are cheap
- Deletion detection (files removed from disk are removed from the library)
- Directory handles persist across sessions in IndexedDB (the browser still
  requires a permission re-grant per session — this is a File System Access
  API security requirement, not something we can bypass)

**Playback**
- Queue with shuffle/repeat (off/all/one), seek, volume, mute, playback speed
- Media Session API integration — lock-screen/notification controls and
  hardware media keys work
- Play/skip counting (a play counts past 50% listened or 30s, whichever is
  shorter — a common scrobble-style heuristic)

**UI**
- Bottom tab nav (Home / Library / Search / Queue), persistent mini-player,
  full-screen Now Playing with swipe-up/down gestures
- Virtualized song list (`react-window`) that stays fast at 250k+ songs by
  keeping only sorted IDs in memory and fetching full records for the visible
  window on demand — see `src/state/useVirtualSongs.js`
- Fuzzy, cross-entity search (songs/artists/albums) with recent searches
- Home feed built from real data you already have (recently added, favorites,
  most played) rather than a placeholder

**Database**
- Versioned IndexedDB schema (`src/db/schema.js`) — bump `DB_VERSION` and add
  an `if (oldVersion < N)` block for future migrations, don't edit released
  versions in place
- Songs, artists, albums, genres, playlists, play history, directory handles,
  and a content-hash-deduped artwork cache

## Key decisions worth knowing about

- **No TypeScript, per your latest spec.** Worth double-checking this was
  intentional — your original spec allowed TS "if it provides meaningful
  maintainability benefits," and a codebase this size (many IndexedDB record
  shapes, a queue/engine state machine) is exactly the case TS earns its
  keep. Nothing here fights a later migration if you change your mind: no
  `any`-shaped dynamic magic, consistent object shapes throughout.
- **`music-metadata` instead of hand-rolling tag parsers.** Writing and
  maintaining ID3v2/FLAC/Vorbis/MP4 parsers from scratch isn't a good use of
  effort when a well-maintained library covers all seven required formats.
  This is the one dependency doing real "format parsing" work; per the
  extensibility principle, it's the correct place to accept a library rather
  than build our own plugin system for something with only one real
  implementation in-house.
- **Search is a single in-memory fuzzy scan (`src/search/`), not an
  abstraction.** Fast enough at 250k songs (sub-50ms typically) and matches
  "does not need a fully pluggable architecture from day one." If it's ever
  too slow, the fix is a proper index (e.g. FlexSearch) behind the same
  `search(query, version)` function signature — not a rewrite.
- **The playback engine is one concrete class**, not an interface, per your
  architecture principle — there's exactly one playback implementation.
- **Directory scanning runs on the main thread** with cooperative yielding
  (`setTimeout(0)` every 25 files) rather than a Web Worker. `FileSystemDirectoryHandle`
  is structured-cloneable, so moving this to a worker later is a contained
  change — but it wasn't worth doing before there's a real library to profile
  against.

## What's next, in priority order

1. ~~Stable playback~~ — done for local files; gapless/crossfade/ReplayGain
   deliberately deferred per your spec
2. ~~Library management~~ — done; Artists/Albums/Genres browse views (the
   data model already supports them, just needs list UI reusing `SongList`'s
   pattern) are the natural next increment
3. **Search** — functional; recent-searches persistence currently uses
   `sessionStorage` (clears per tab) rather than IndexedDB — cheap to move
   over
4. **Discovery** — not started. Home currently shows real "recently added /
   favorites / most played" rails as an honest placeholder rather than fake
   Daily Mix data
5. **Recommendation engine / external providers** — not started
6. **UI polish** — the gesture system is functional but not physics-based
   (no follow-the-finger drag on Now Playing yet, just threshold-based swipe
   detection); this is the first thing worth revisiting once the feature set
   above stabilizes
7. **Advanced audio features** (gapless, crossfade, ReplayGain, EQ,
   visualizers) — per your spec, intentionally not pre-architected

## Project layout

```
src/
  db/          IndexedDB schema + repositories (concrete, no storage abstraction)
  library/     folder scanning, metadata parsing, file resolution
  audio/       playback engine, queue, Media Session integration
  search/      in-memory fuzzy search
  state/       React context bridging the engine/library into components
  components/  layout, player, library, common UI pieces
  views/       Home, Library, Search, Queue, Settings
```
