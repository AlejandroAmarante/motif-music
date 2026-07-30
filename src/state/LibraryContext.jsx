import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  isFileSystemAccessSupported,
  addLibraryFolder,
  listLibraryFolders,
  removeLibraryFolder,
  scanAllFolders
} from '../library/libraryManager.js';
import { countSongs } from '../db/songsRepo.js';

const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
  const [folders, setFolders] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [songCount, setSongCount] = useState(0);
  const [version, setVersion] = useState(0); // bump to signal "reload from DB"

  const refreshFolders = useCallback(async () => {
    setFolders(await listLibraryFolders());
  }, []);

  const refreshCount = useCallback(async () => {
    setSongCount(await countSongs());
  }, []);

  useEffect(() => {
    refreshFolders();
    refreshCount();
  }, [refreshFolders, refreshCount]);

  const addFolder = useCallback(async () => {
    await addLibraryFolder();
    await refreshFolders();
    await scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshFolders]);

  const removeFolder = useCallback(
    async (id) => {
      await removeLibraryFolder(id);
      await refreshFolders();
      await refreshCount();
      setVersion((v) => v + 1);
    },
    [refreshFolders, refreshCount]
  );

  const scan = useCallback(async () => {
    setScanning(true);
    setScanProgress(null);
    try {
      await scanAllFolders({
        onFolderStart: (folder) => setScanProgress({ folder: folder.name, ...{ scanned: 0 } }),
        onProgress: (folder, progress) => setScanProgress({ folder: folder.name, ...progress }),
        onFolderDone: () => {}
      });
    } finally {
      setScanning(false);
      setScanProgress(null);
      await refreshCount();
      setVersion((v) => v + 1);
    }
  }, [refreshCount]);

  const value = {
    supported: isFileSystemAccessSupported(),
    folders,
    scanning,
    scanProgress,
    songCount,
    version,
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
