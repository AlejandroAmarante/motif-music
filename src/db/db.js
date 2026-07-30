import { openDB } from 'idb';
import { DB_NAME, DB_VERSION, upgrade } from './schema.js';

let dbPromise = null;

/** Lazily opens (or returns the cached handle to) the Motif database. */
export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade,
      blocked() {
        console.warn('[motif/db] upgrade blocked by another open tab');
      },
      blocking() {
        console.warn('[motif/db] this tab is blocking an upgrade in another tab');
      }
    });
  }
  return dbPromise;
}
