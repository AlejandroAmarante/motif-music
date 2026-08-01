import { getDb } from './db.js';

export async function getSetting(key, fallback = null) {
  const db = await getDb();
  const row = await db.get('meta', key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  const db = await getDb();
  await db.put('meta', { key, value });
}
