// src/library/navigation.js — NEW
import { countByArtistId } from "../db/songsRepo.js";

/**
 * Decides what tapping the artist name on Now Playing should do.
 *
 * With more than one local track by the artist *and* an album to compare
 * it against, "the artist" and "this album" are genuinely different
 * destinations, so the caller should present that choice. Otherwise —
 * a single track, or a track with no album at all — Artist and Album
 * views would show near-identical content, so this skips the chooser and
 * goes straight to the artist.
 */
export async function resolveArtistNavigation(song) {
  if (!song?.artistId) return null;
  const trackCount = await countByArtistId(song.artistId);
  if (trackCount > 1 && song.albumId) {
    return { type: "choice", artistId: song.artistId, albumId: song.albumId };
  }
  return { type: "artist", artistId: song.artistId };
}
