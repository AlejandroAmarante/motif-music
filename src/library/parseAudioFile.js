// src/library/parseAudioFile.js — NEW
import { parseBuffer } from "music-metadata";

/**
 * Reads `file` fully into memory ONCE and parses it from that in-memory
 * buffer via music-metadata's parseBuffer(), instead of parseBlob().
 *
 * Root cause of the ~25s-per-file stall seen on Android: parseBlob() reads
 * through strtok3's Blob tokenizer, which walks the file issuing many
 * small blob.slice().arrayBuffer() calls as it parses. Each of those
 * calls crosses into the browser process to touch the on-disk file —
 * overhead that's negligible on desktop but dominates on Android, and it
 * adds up regardless of which options (duration, skipCovers) are set,
 * since skipping a frame still means seeking/reading through the
 * Blob-backed stream to get past it. Reading the file once into a
 * Uint8Array and parsing from that buffer collapses everything into a
 * single read; every access after that is pure in-memory work, with none
 * of the per-call IPC cost that was actually responsible for the delay.
 */
export async function parseAudioFile(file, options) {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  return parseBuffer(
    buffer,
    { path: file.name, mimeType: file.type || undefined, size: file.size },
    options,
  );
}
