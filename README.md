# Motif — Local-First Music Player & Discovery PWA

Your library, not a subscription. Motif reads music straight from your device's
file system — nothing is uploaded, copied, or streamed from a server you don't
control.

## Status: Priorities 1–2 (stable playback + library management) implemented, 3 (search) started

This is a working vertical slice, not a full build of the spec — see
"What's next" below for what's deliberately deferred and why.

## Recent pass: interaction and playback-integrity fixes

- **Lyrics — implemented differently than requested, on purpose.** The
  referenced library (`am-lyrics`) fetches lyrics by scraping Apple Music's
  internal endpoints — its sibling repos are explicit about being
  reverse-engineered access to paid streaming services. I didn't wire that
  up: unauthorized extraction of copyrighted lyrics text from a commercial
  service isn't something I'll build, regardless of framing. Instead,
  `src/library/lyrics.js` reads **sidecar `.lrc` files** (the standard local
  synced-lyrics format — drop `song.lrc` next to `song.mp3`) and **embedded
  tag lyrics** (USLT/SYLT, whatever your tagger already wrote), both parsed
  entirely offline. Same UX — mic button only when lyrics exist, time-synced
  highlighting, tap a line to jump — different data source, one that
  actually fits "local-first, user-owned."
- **Mini-player tap isolation.** The play/pause button's `stopPropagation()`
  was only on `onClick`, which fires *after* the swipe hook's `pointerup` —
  so tapping play was also expanding Now Playing. Fixed by isolating the
  pointer events themselves, not just the click.
- **Now Playing gestures are whole-screen** (swipe down closes, left/right
  skips, matching Spotify), with the seek bar and volume slider explicitly
  opting out via `stopPropagation` so scrubbing doesn't also skip tracks.
- **Seeking no longer previews audio while dragging** — `onInput` updates
  the displayed position locally; the actual `seek()` call only fires on
  `onChange`, which the browser only dispatches once you release.
- **Found and fixed a real stale-metadata bug** while addressing the
  "stale info after a skip" report: `getState()` was reading
  `audio.currentTime`/`audio.duration` before `audio.src` had actually been
  reassigned to the new track, so for one brief emit per skip, the new
  song's title could pair with the *previous* song's playback position.
  Now both are forced to the new track's own values while a load is in
  flight. Also fixed a related infinite-loop hazard: repeat-one retrying
  the same broken file forever.
- **Progress bar is properly smooth now** — driven by a
  `requestAnimationFrame` loop that dead-reckons between the audio
  element's actual (fairly sparse) `timeupdate` ticks, instead of visibly
  stepping once per tick.
- **Missing files are handled explicitly**, not silently: a track that
  fails to load gets greyed out in Library with a remove action, rather
  than just vanishing into a console error. Configurable via Connected
  Folders → "Automatically remove unavailable songs."
- **Configurable rescanning** — manual / on startup / every few minutes /
  hourly, plus a best-effort **experimental** "watch for changes" mode
  using `FileSystemObserver`. That API is very new and not widely shipped;
  Motif feature-detects it and falls back to a toast + manual mode if it's
  unavailable, rather than silently doing nothing.
- **Folder management moved out of Library** into its own Connected
  Folders sheet (reachable from Library's header and from Settings), so
  browsing your music isn't sharing space with folder admin.
- Motif-mark pulse animation is now tied to actual playback state — it
  only pulses for the artwork of a track that's both missing art *and*
  actively playing; every other fallback (list rows, rails) is static.
  Removed the decorative static mark under the bottom nav entirely.
- Home and Search now have proper headers, matching Library/Queue.
- Volume slider hidden on touch devices (hardware buttons cover it);
  desktop keeps it.
- Spacing audit: added a `--space-*` token scale and fixed the
  specifically-flagged header-to-content gap, plus a few other spots.

## Recent pass: visual/motion refinement

- **Monochrome palette** — black/charcoal/near-white throughout; the old amber
  accent is gone. Color now means something specific (errors, the one
  success toast) instead of decorating the UI.
- **Newsreader (serif) for headings**, Inter (sans) for everything
  functional — body text, buttons, inputs, labels. The pairing is meant to
  read as considered, not techy.
- **App icon** replaced with your uploaded mark, composited onto black at
  192/512/maskable sizes (`public/icons/`, regenerate via
  `rsvg-convert` if you ever need PNG fallbacks).
- **"Motif" wordmark removed from in-app chrome** — Home's header is now
  just the settings affordance. Section labels (Library/Search/Queue) stay,
  since those are navigation, not branding.
- **Motion is now bidirectional.** `src/utils/useMountTransition.js` is the
  one hook behind Now Playing, Settings, and toasts — every sheet that
  slides in also slides out, instead of vanishing. Queue row removal
  collapses/fades rather than disappearing instantly.
- **Toasts** (`src/state/toastBus.js` + `ToastHost`) — a plain pub/sub, not a
  React context, specifically so non-React code (`AudioEngine`) can surface
  feedback too. Wired into scan completion, folder disconnect, and playback
  failures (previously silent — a track that failed to load just skipped
  with no explanation).
- **Touch targets increased** — `--thumb` 44→50px, row heights, thumbnails,
  and remove/rescan buttons all sized up.
- **Library now has its own always-visible search/filter bar**, separate
  from the global Search tab — filters songs in place and surfaces matching
  albums as tappable chips that narrow the list further.
- **Fixed a real bug while wiring that up**: the fuzzy search index only
  ever held lite rows (id/title/artist/album) to stay cheap at 250k songs,
  but `SearchView` was rendering those rows directly — so search results
  never showed real artwork or duration, silently falling back to the
  placeholder every time. `search()` now hydrates the capped result set
  (≤25 songs) into full records before returning them.
- **Sample tracks for testing without a library.** I don't have network
  access to any royalty-free audio host from this sandbox (the egress
  allowlist covers package registries, not media CDNs), so "pull in a
  curated set automatically" wasn't possible. Per the fallback you specified,
  `public/samples/` has three short clips instead — but to be direct about
  what they are: they're **synthesized placeholder tones I generated locally**
  (pure-Python sine synthesis, no dependencies), not licensed or downloaded
  music. They're labeled as such in the UI ("Motif Samples" / "Placeholder
  Tones") rather than presented as real songs. If you want actual royalty-free
  tracks, drop real files at the same paths in `public/samples/` and update
  `src/library/sampleTracks.js` — the playback path (`AudioEngine` now
  branches on `song.sampleUrl` vs. File System Access resolution) doesn't care
  which.

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

To actually test playback with your own files you need a folder of
MP3/FLAC/WAV/OGG/OPUS/AAC/M4A on disk — connect one from Home or Settings.
Or use "Play sample tracks" (Home empty state, or Settings → Test playback)
for an immediate, no-setup smoke test.

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
3. **Search** — functional in both the global Search tab and as an in-place
   filter bar on Library (with tappable album chips). Playlist filtering
   isn't there yet since there's no playlist browsing UI to filter within —
   natural to add once playlists get a real view. Recent-searches
   persistence currently uses `sessionStorage` (clears per tab) rather than
   IndexedDB — cheap to move over.
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
  library/     folder scanning, metadata parsing, lyrics (.lrc + embedded),
               file resolution, missing-file bookkeeping, filesystem watching
  audio/       playback engine, queue, Media Session integration
  search/      in-memory fuzzy search
  state/       React context + two small pub/subs (toastBus, libraryBus) that
               let non-React modules (AudioEngine) talk to the UI without a
               React dependency
  components/  layout, player (incl. lyrics overlay), library, common UI pieces
  views/       Home, Library, Search, Queue, Settings, Connected Folders
```
