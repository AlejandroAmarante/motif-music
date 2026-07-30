import {
  addDirectoryHandle,
  getAllDirectoryHandles,
  touchLastScanned,
  removeDirectoryHandle,
  ensurePermission
} from '../db/directoryHandlesRepo.js';
import { scanDirectory } from './scanner.js';

export function isFileSystemAccessSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Opens the native folder picker and registers the chosen folder as a library root. */
export async function addLibraryFolder() {
  const handle = await window.showDirectoryPicker({ mode: 'read' });
  const granted = await ensurePermission(handle);
  if (!granted) throw new Error('Permission to read the folder was denied.');
  return addDirectoryHandle(handle);
}

export async function listLibraryFolders() {
  return getAllDirectoryHandles();
}

export async function removeLibraryFolder(id) {
  return removeDirectoryHandle(id);
}

/** Scans every registered root, re-requesting permission per folder as needed. */
export async function scanAllFolders({ onProgress, onFolderStart, onFolderDone } = {}) {
  const folders = await getAllDirectoryHandles();
  const overall = { created: 0, updated: 0, unchanged: 0, removed: 0, errors: 0 };

  for (const folder of folders) {
    onFolderStart?.(folder);
    const granted = await ensurePermission(folder.handle);
    if (!granted) {
      onFolderDone?.(folder, { skipped: true, reason: 'permission-denied' });
      continue;
    }

    const stats = await scanDirectory(folder, {
      onProgress: (progress) => onProgress?.(folder, progress)
    });

    for (const key of Object.keys(overall)) overall[key] += stats[key] || 0;
    await touchLastScanned(folder.id);
    onFolderDone?.(folder, stats);
  }

  return overall;
}
