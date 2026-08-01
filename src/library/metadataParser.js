import { parseBlob } from 'music-metadata';
import { extractEmbeddedLyrics } from './lyrics.js';

/**
 * Parses a File into Motif's normalized tag shape. Falls back gracefully —
 * a file with unreadable/missing tags still becomes a playable song, just
 * with the filename as its title.
 */
export async function parseFileMetadata(file) {
  try {
    const metadata = await parseBlob(file, { duration: true, skipCovers: false });
    const { common, format } = metadata;

    const picture = common.picture?.[0];

    return {
      title: common.title || null,
      artist: common.artist || common.albumartist || null,
      album: common.album || null,
      albumArtist: common.albumartist || common.artist || null,
      trackNumber: common.track?.no ?? null,
      discNumber: common.disk?.no ?? null,
      genre: common.genre || [],
      year: common.year || null,
      duration: format.duration || 0,
      bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null, // kbps
      sampleRate: format.sampleRate || null,
      artworkBytes: picture ? picture.data : null,
      artworkMime: picture ? picture.format : null,
      embeddedLyrics: extractEmbeddedLyrics(common.lyrics)
    };
  } catch (err) {
    console.warn(`[motif/metadata] failed to parse tags for ${file.name}:`, err.message);
    return {
      title: null,
      artist: null,
      album: null,
      albumArtist: null,
      trackNumber: null,
      discNumber: null,
      genre: [],
      year: null,
      duration: 0,
      bitrate: null,
      sampleRate: null,
      artworkBytes: null,
      artworkMime: null,
      embeddedLyrics: null
    };
  }
}
