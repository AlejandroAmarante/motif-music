// src/db/albumMetaRepo.js — NEW
import { getDb } from "./db.js";

export async function getAlbumMetaCache(key) {
  if (!key) return null;
  const db = await getDb();
  return db.get("albumMeta", key);
}

export async function putAlbumMetaCache(entry) {
  const db = await getDb();
  await db.put("albumMeta", entry);
  return entry;
}
