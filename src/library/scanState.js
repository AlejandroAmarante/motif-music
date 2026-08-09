// A simple ref-count rather than a boolean: scanAllFolders() runs
// scanDirectory() per folder sequentially, but resumePendingEnrichment()
// (on app load) could in principle overlap with a user-triggered rescan,
// and a plain boolean would let one finishing clear the flag out from
// under the other.
let activeScans = 0;

export function beginScanActivity() {
  activeScans += 1;
}

export function endScanActivity() {
  activeScans = Math.max(0, activeScans - 1);
}

/**
 * True while a scan is actively discovering/enriching files. Used by
 * artworkManager.js to hold off on per-album "searching / found / not
 * found" toasts during a bulk import — dozens of albums resolving in
 * quick succession would otherwise flood the user with notifications for
 * something they didn't individually ask about. Artwork still resolves
 * and caches normally either way; only the toast is held back.
 */
export function isScanActive() {
  return activeScans > 0;
}
