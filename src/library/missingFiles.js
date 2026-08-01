import { markMissing, removeById } from '../db/songsRepo.js';
import { getSetting } from '../db/settingsRepo.js';
import { notifyLibraryChanged } from '../state/libraryBus.js';

/** Called when resolveFile() fails for a library song during playback. */
export async function handleLoadFailure(song) {
  if (!song || song.sampleUrl) return; // bundled demo tracks aren't library entries
  const autoRemove = await getSetting('autoRemoveMissing', false);
  if (autoRemove) {
    await removeById(song.id);
  } else {
    await markMissing(song.id, true);
  }
  notifyLibraryChanged();
}

/** Called when a song that was previously flagged missing plays successfully again. */
export async function handleLoadSuccess(song) {
  if (!song || song.sampleUrl || !song.missing) return;
  await markMissing(song.id, false);
  notifyLibraryChanged();
}
