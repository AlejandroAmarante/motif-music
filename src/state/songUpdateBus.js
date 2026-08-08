// src/state/songUpdateBus.js — NEW
const listeners = new Map(); // songId -> Set<fn>

/**
 * Fired when a specific song's record changes in place — currently just
 * scanner.js, once enrichSong() finishes turning a pending placeholder
 * into a fully-tagged row. Scoped per-id (unlike libraryBus's blanket
 * "something changed") so a rendered SongRow can pick up its own update
 * the instant it happens, without waiting on — or forcing — a full list
 * refresh via the shared virtualization cache.
 */
export function notifySongUpdated(song) {
  if (!song?.id) return;
  const set = listeners.get(song.id);
  if (!set) return;
  set.forEach((fn) => fn(song));
}

export function onSongUpdated(songId, fn) {
  if (!songId) return () => {};
  if (!listeners.has(songId)) listeners.set(songId, new Set());
  listeners.get(songId).add(fn);
  return () => {
    const set = listeners.get(songId);
    if (!set) return;
    set.delete(fn);
    if (!set.size) listeners.delete(songId);
  };
}