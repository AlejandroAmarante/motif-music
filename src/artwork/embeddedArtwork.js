import { parseBlob } from "music-metadata";
import { storeArtwork } from "../db/artworkRepo.js";

function normalizeKeyPart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Generates a scan-scoped key for embedded artwork deduplication.
 *
 * Tracks from the same album normally share the same embedded cover, so only
 * one representative track needs to have its artwork extracted.
 */
export function makeEmbeddedArtworkKey({ artist, albumArtist, album, year }) {
  const normalizedArtist = normalizeKeyPart(albumArtist || artist);

  const normalizedAlbum = normalizeKeyPart(album);

  const normalizedYear = year ? String(year) : "";

  if (!normalizedArtist || !normalizedAlbum) {
    return null;
  }

  return `${normalizedArtist}|${normalizedAlbum}|${normalizedYear}`;
}

/**
 * Extracts the first embedded image from an audio file.
 *
 * IMPORTANT:
 * storeArtwork() expects an ArrayBuffer or ArrayBufferView because it hashes
 * the bytes through crypto.subtle.digest(). Do not convert picture.data to a
 * Blob before passing it to storeArtwork().
 */
export async function extractEmbeddedArtwork(file) {
  try {
    const metadata = await parseBlob(file, {
      duration: false,
      skipCovers: false,
    });

    const picture = metadata.common.picture?.[0];

    if (!picture?.data || picture.data.byteLength === 0) {
      return null;
    }

    const artworkId = await storeArtwork(
      picture.data,
      picture.format || "application/octet-stream",
    );

    if (!artworkId) {
      return null;
    }

    return {
      artworkId,
      mimeType: picture.format || "application/octet-stream",
    };
  } catch (err) {
    console.warn(
      `[motif/artwork] failed to extract embedded artwork from ${file.name}:`,
      err?.message || err,
    );

    return null;
  }
}

function createConcurrencyGate(limit) {
  let active = 0;
  const queue = [];

  function runNext() {
    if (active >= limit || queue.length === 0) {
      return;
    }

    active += 1;

    const { task, resolve, reject } = queue.shift();

    Promise.resolve()
      .then(task)
      .then(
        (result) => {
          active -= 1;
          resolve(result);
          runNext();
        },
        (err) => {
          active -= 1;
          reject(err);
          runNext();
        },
      );
  }

  return function gate(task) {
    return new Promise((resolve, reject) => {
      queue.push({
        task,
        resolve,
        reject,
      });

      runNext();
    });
  };
}

/**
 * Creates a scan-scoped resolver.
 *
 * One album:
 *
 *   Track 1 ─┐
 *   Track 2 ─┼─> one artwork extraction
 *   Track 3 ─┘
 *
 * The first track reaching the resolver performs the extraction. All later
 * tracks reuse the same promise.
 */
export function createEmbeddedArtworkResolver({ concurrency = 1 } = {}) {
  const gate = createConcurrencyGate(Math.max(1, Math.min(2, concurrency)));

  const promisesByKey = new Map();

  function getOrExtract({ key, file }) {
    if (!key || !file) {
      return Promise.resolve(null);
    }

    const existing = promisesByKey.get(key);

    if (existing) {
      return existing;
    }

    const promise = gate(() => extractEmbeddedArtwork(file)).catch((err) => {
      console.warn(
        "[motif/artwork] embedded artwork task failed:",
        err?.message || err,
      );

      return null;
    });

    promisesByKey.set(key, promise);

    return promise;
  }

  function get(key) {
    if (!key) {
      return null;
    }

    return promisesByKey.get(key) ?? null;
  }

  return {
    getOrExtract,
    get,
  };
}
