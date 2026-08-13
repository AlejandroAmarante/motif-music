// src/library/lyricsResolver.js — NEW
import { resolveFileHandles } from "./resolveFile.js";
import { parseAudioFile } from "./parseAudioFile.js";
import { extractEmbeddedLyrics, mergeLyrics } from "./lyrics.js";
import { fetchLrclibLyrics } from "./lrclib.js";

async function readSidecarLrc(parentHandle, fileName) {
  const lrcName = fileName.replace(/\.[^./]+$/, "") + ".lrc";

  try {
    const lrcHandle = await parentHandle.getFileHandle(lrcName);
    const lrcFile = await lrcHandle.getFile();
    return await lrcFile.text();
  } catch {
    return null;
  }
}

async function readEmbeddedLyrics(file) {
  try {
    // skipCovers: true — this lookup only needs the lyrics tag, not
    // artwork, so there's no reason to materialize the cover here.
    const metadata = await parseAudioFile(file, {
      duration: false,
      skipCovers: true,
    });
    return extractEmbeddedLyrics(metadata.common.lyrics);
  } catch (err) {
    console.warn("[motif/lyrics] embedded lyrics read failed:", err.message);
    return null;
  }
}

/**
 * Lazily resolves lyrics for a song. Only ever called on demand — when the
 * user opens the Lyrics view for a track that hasn't been checked yet (see
 * LyricsView.jsx) — never during a folder scan.
 *
 * Order: sidecar .lrc -> embedded tag lyrics -> LRCLIB.
 *
 * Returns the same tri-state contract fetchLrclibLyrics always has:
 *  - a lyrics object `{ synced, text }` — found, safe to cache
 *  - `false` — confirmed nowhere (LRCLIB reached, nothing found)
 *  - `null` — the lookup couldn't be completed (network/CORS/etc.); do NOT
 *    cache this as "unavailable", the caller should be able to retry later
 */
export async function resolveLyricsForSong(song) {
  try {
    const { fileHandle, parentHandle } = await resolveFileHandles(song);
    const file = await fileHandle.getFile();

    const [lrcText, embedded] = await Promise.all([
      readSidecarLrc(parentHandle, file.name),
      readEmbeddedLyrics(file),
    ]);

    const local = mergeLyrics({ lrcText, embedded });
    if (local) return local;
  } catch (err) {
    console.warn("[motif/lyrics] local lyrics lookup failed:", err.message);
  }

  return fetchLrclibLyrics({
    title: song.title,
    artist: song.artist,
    album: song.album,
    duration: song.duration,
  });
}
