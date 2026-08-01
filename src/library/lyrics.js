const LRC_LINE = /^\[(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\](.*)$/;

/** Parses standard LRC ([mm:ss.xx]text per line) into a synced lyric array. */
export function parseLrc(text) {
  if (!text) return null;
  const lines = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const match = LRC_LINE.exec(rawLine.trim());
    if (!match) continue;
    const [, mm, ss, frac, lyricText] = match;
    const fracSeconds = frac ? Number(frac.padEnd(3, '0')) / 1000 : 0;
    const time = Number(mm) * 60 + Number(ss) + fracSeconds;
    const cleanText = lyricText.trim();
    if (cleanText) lines.push({ time, text: cleanText });
  }
  if (!lines.length) return null;
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

/**
 * Defensively pulls lyrics out of music-metadata's common.lyrics field.
 * The exact shape varies by tagger and library version, so this never
 * throws — a shape it doesn't recognize just falls back to "no lyrics"
 * rather than breaking metadata parsing for the whole file.
 */
export function extractEmbeddedLyrics(commonLyrics) {
  try {
    const entry = commonLyrics?.[0];
    if (!entry) return null;

    const syncText = entry.syncText;
    if (Array.isArray(syncText) && syncText.length > 1) {
      const synced = syncText
        .filter((l) => l && typeof l.text === 'string' && l.text.trim())
        .map((l) => ({ time: (l.timestamp || 0) / 1000, text: l.text.trim() }));
      if (synced.length > 1) return { synced, text: synced.map((l) => l.text).join('\n') };
    }

    const plain = Array.isArray(syncText) ? syncText.map((l) => l?.text).filter(Boolean).join('\n') : entry.text;
    if (typeof plain === 'string' && plain.trim()) return { synced: null, text: plain.trim() };
  } catch {
    // Unrecognized shape — no lyrics rather than a broken scan.
  }
  return null;
}

/** Sidecar .lrc files win when present (usually cleaner/more complete than embedded tags). */
export function mergeLyrics({ lrcText, embedded }) {
  const synced = parseLrc(lrcText);
  if (synced) return { synced, text: synced.map((l) => l.text).join('\n') };
  if (embedded) return embedded;
  return null;
}
