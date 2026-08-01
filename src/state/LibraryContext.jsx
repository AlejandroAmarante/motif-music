import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  isFileSystemAccessSupported,
  addLibraryFolder,
  listLibraryFolders,
  removeLibraryFolder,
  scanAllFolders
} from '../library/libraryManager.js';
import { countSongs } from '../db/songsRepo.js';
import { getSetting, setSetting } from '../db/settingsRepo.js';
import { watchFolders, isWatchSupported } from '../library/watchFolders.js';
import { pushToast } from './toastBus.js';
import { onLibraryChanged } from './libraryBus.js';

const LibraryContext = createContext(null);

const INTERVAL_MS = {
  'interval-5': 5 * 60 * 1000,
  'interval-60': 60 * 60 * 1000
};

export function LibraryProvider({ children }) {
  const [folders, setFolders] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [songCount, setSongCount] = useState(0);
  const [version, setVersion] = useState(0); // bump to signal "reload from DB"
  const [scanMode, setScanModeState] = useState('manual');
  const [autoRemoveMissing, setAutoRemoveMissingState] = useState(false);
  const didStartupScan = useRef(false);

  const refreshFolders = useCallback(async () => {
    setFolders(await listLibraryFolders());
  }, []);

  const refreshCount = useCallback(async () => {
    setSongCount(await countSongs());
  }, []);

  useEffect(() => {
    refreshFolders();
    refreshCount();
    getSetting('scanMode', 'manual').then(setScanModeState);
    getSetting('autoRemoveMissing', false).then(setAutoRemoveMissingState);
  }, [refreshFolders, refreshCount]);

  // Any out-of-band library mutation (AudioEngine marking/removing a
  // missing file, a background scan) bumps version and refreshes the count
  // without those non-React modules needing to know about this context.
  useEffect(() => onLibraryChanged(() => {
    refreshCount();
    setVersion((v) => v + 1);
  }), [refreshCount]);

  const addFolder = useCallback(async () => {
    await addLibraryFolder();
    await refreshFolders();
    await scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshFolders]);

  const removeFolder = useCallback(
    async (id) => {
      const folder = folders.find((f) => f.id === id);
      await removeLibraryFolder(id);
      await refreshFolders();
      await refreshCount();
      setVersion((v) => v + 1);
      if (folder) pushToast(`Disconnected “${folder.name}”`);
    },
    [folders, refreshFolders, refreshCount]
  );

  const scan = useCallback(async () => {
    setScanning(true);
    setScanProgress(null);
    const totals = { created: 0, updated: 0, removed: 0 };
    try {
      const result = await scanAllFolders({
        onFolderStart: (folder) => setScanProgress({ folder: folder.name, ...{ scanned: 0 } }),
        onProgress: (folder, progress) => setScanProgress({ folder: folder.name, ...progress }),
        onFolderDone: () => {}
      });
      Object.assign(totals, result);
    } finally {
      setScanning(false);
      setScanProgress(null);
      await refreshCount();
      setVersion((v) => v + 1);
      const added = totals.created || 0;
      const removed = totals.removed || 0;
      if (added || removed) {
        const parts = [];
        if (added) parts.push(`${added} song${added === 1 ? '' : 's'} added`);
        if (removed) parts.push(`${removed} removed`);
        pushToast(parts.join(', '), { type: added ? 'success' : 'info' });
      }
    }
  }, [refreshCount]);

  const setScanMode = useCallback(async (mode) => {
    if (mode === 'watch' && !isWatchSupported()) {
      pushToast('This browser doesn’t support filesystem watching yet — try an interval instead.', { type: 'error' });
      return;
    }
    setScanModeState(mode);
    await setSetting('scanMode', mode);
  }, []);

  const setAutoRemoveMissing = useCallback(async (value) => {
    setAutoRemoveMissingState(value);
    await setSetting('autoRemoveMissing', value);
  }, []);

  // "On application startup" — fires once per app session, only if there's
  // actually a library to check.
  useEffect(() => {
    if (didStartupScan.current) return;
    if (scanMode === 'startup' && folders.length > 0) {
      didStartupScan.current = true;
      scan();
    }
  }, [scanMode, folders, scan]);

  // Periodic rescans while the app stays open.
  useEffect(() => {
    const ms = INTERVAL_MS[scanMode];
    if (!ms) return;
    const id = setInterval(() => {
      if (!scanning) scan();
    }, ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode]);

  // Best-effort live filesystem watching (experimental — see watchFolders.js).
  useEffect(() => {
    if (scanMode !== 'watch' || folders.length === 0) return;
    const cleanup = watchFolders(folders, () => scan(), {
      onUnsupported: () => {
        pushToast('Filesystem watching isn’t available here — falling back to manual scans.', { type: 'error' });
      }
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode, folders]);

  const value = {
    supported: isFileSystemAccessSupported(),
    watchSupported: isWatchSupported(),
    folders,
    scanning,
    scanProgress,
    songCount,
    version,
    scanMode,
    setScanMode,
    autoRemoveMissing,
    setAutoRemoveMissing,
    addFolder,
    removeFolder,
    rescan: scan
  };

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used within <LibraryProvider>');
  return ctx;
}
