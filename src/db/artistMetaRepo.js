// src/db/artistMetaRepo.js — NEW
import { getDb } from "./db.js";

export async function getArtistMetaCache(key) {
  if (!key) return null;
  const db = await getDb();
  return db.get("artistMeta", key);
}

export async function putArtistMetaCache(entry) {
  const db = await getDb();
  await db.put("artistMeta", entry);
  return entry;
}
