import { getDb } from './db.js';
import { makeId } from '../utils/id.js';

export async function addDirectoryHandle(handle) {
  const db = await getDb();
  const record = {
    id: makeId('dir'),
    name: handle.name,
    handle,
    addedAt: Date.now(),
    lastScannedAt: null
  };
  await db.add('directoryHandles', record);
  return record;
}

export async function getAllDirectoryHandles() {
  const db = await getDb();
  return db.getAll('directoryHandles');
}

export async function touchLastScanned(id) {
  const db = await getDb();
  const tx = db.transaction('directoryHandles', 'readwrite');
  const record = await tx.store.get(id);
  if (record) {
    record.lastScannedAt = Date.now();
    await tx.store.put(record);
  }
  await tx.done;
}

export async function removeDirectoryHandle(id) {
  const db = await getDb();
  await db.delete('directoryHandles', id);
}

/**
 * Directory handles are persisted, but the browser still requires the user
 * to grant permission again each session for security reasons. Call this
 * before scanning; it prompts only if permission has actually lapsed.
 */
export async function ensurePermission(handle, mode = 'read') {
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  const result = await handle.requestPermission(opts);
  return result === 'granted';
}
