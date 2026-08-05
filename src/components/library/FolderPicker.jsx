import { Plus } from "lucide-react";
import { useLibrary } from "../../state/LibraryContext.jsx";

export function FolderPicker() {
  const {
    supported,
    folders,
    scanning,
    scanProgress,
    songCount,
    addFolder,
    removeFolder,
    rescan,
  } = useLibrary();

  if (!supported) {
    return (
      <div className="folder-picker__unsupported">
        <p>
          Motif reads music straight from your device's file system, which needs
          a browser that supports the File System Access API — Chrome or Edge on
          desktop or Android. Open Motif there to connect a folder.
        </p>
      </div>
    );
  }

  return (
    <div className="folder-picker">
      <button
        className="folder-picker__add"
        onClick={addFolder}
        disabled={scanning}
      >
        <Plus size={21} strokeWidth={2} />
        Connect a folder
      </button>

      {folders.length > 0 && (
        <ul className="folder-picker__list">
          {folders.map((folder) => (
            <li key={folder.id} className="folder-picker__item">
              <span className="folder-picker__name">{folder.name}</span>
              <button
                className="folder-picker__remove"
                onClick={() => removeFolder(folder.id)}
                aria-label={`Disconnect ${folder.name}`}
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}

      {folders.length > 0 && (
        <button
          className="folder-picker__rescan"
          onClick={rescan}
          disabled={scanning}
        >
          Rescan library
        </button>
      )}

      {scanning && (
        <div className="folder-picker__progress">
          <span className="motif-mark pulse" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>
            {scanProgress?.folder
              ? `Scanning ${scanProgress.folder} — ${scanProgress.scanned ?? 0} files`
              : "Scanning…"}
          </span>
        </div>
      )}

      {!scanning && songCount > 0 && (
        <p className="folder-picker__count mono">
          {songCount.toLocaleString()} songs in your library
        </p>
      )}
    </div>
  );
}
