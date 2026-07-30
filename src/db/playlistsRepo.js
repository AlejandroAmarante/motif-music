import { getDb } from './db.js';
import { makeId } from '../utils/id.js';

export async function createPlaylist(name, { type = 'manual', songIds = [], rules = null } = {}) {
  const db = await getDb();
  const playlist = {
    id: makeId('pl'),
    name,
    type, // 'manual' | 'smart' | 'generated'
    songIds,
    rules, // for 'smart' playlists: simple filter criteria, evaluated on read
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await db.add('playlists', playlist);
  return playlist;
}

export async function getAllPlaylists() {
  const db = await getDb();
  return db.getAll('playlists');
}

export async function getPlaylist(id) {
  const db = await getDb();
  return db.get('playlists', id);
}

export async function updatePlaylistSongs(id, songIds) {
  const db = await getDb();
  const tx = db.transaction('playlists', 'readwrite');
  const playlist = await tx.store.get(id);
  if (playlist) {
    playlist.songIds = songIds;
    playlist.updatedAt = Date.now();
    await tx.store.put(playlist);
  }
  await tx.done;
  return playlist;
}

export async function deletePlaylist(id) {
  const db = await getDb();
  await db.delete('playlists', id);
}
