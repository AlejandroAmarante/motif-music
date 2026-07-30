import { getDb } from './db.js';
import { makeId, normalize } from '../utils/id.js';

export async function getOrCreateGenres(names = []) {
  const db = await getDb();
  const ids = [];
  for (const raw of names) {
    const name = raw?.trim();
    if (!name) continue;
    const nameLower = normalize(name);
    let genre = await db.getFromIndex('genres', 'byNameLower', nameLower);
    if (!genre) {
      genre = { id: makeId('genre'), name, nameLower, songCount: 0 };
      await db.add('genres', genre);
    }
    ids.push(genre.id);
  }
  return ids;
}

export async function getAllGenres() {
  const db = await getDb();
  return db.getAll('genres');
}
