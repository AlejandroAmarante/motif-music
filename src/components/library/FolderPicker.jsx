// src/components/library/FolderPicker.jsx — full updated file (real progress bar + ETA + current file + batch index during enrichment; indeterminate bar during discovery)
import { Plus } from "lucide-react";
import { useLibrary } from "../../state/LibraryContext.jsx";
import { formatEta } from "../../utils/formatTime.js";

/** Renders the body of the progress block for whichever phase is active. Discovery has no reliable total (see scanner.js), so it gets an indeterminate bar and a live count; enrichment's total is known up front, so it gets a real determinate bar, an ETA, and what's currently being read. */
function ScanProgressDetail({ scanProgress }) {
  if (!scanProgress?.folder) {
    return <span>Scanning…</span>;
  }

  const {
    folder,
    phase,
    scanned,
    enrichedCount,
    enrichedTotal,
    currentFile,
    batchIndex,
    totalBatches,
    etaMs,
  } = scanProgress;

  if (phase === "enriching") {
    const pct = enrichedTotal
      ? Math.min(100, Math.round(((enrichedCount ?? 0) / enrichedTotal) * 100))
      : 0;
    const eta = formatEta(etaMs);
    return (
      <>
        <div
          className="folder-picker__progress-bar"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="folder-picker__progress-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span>
          Reading tags in {folder} — {(enrichedCount ?? 0).toLocaleString()} of{" "}
          {(enrichedTotal ?? 0).toLocaleString()}
          {totalBatches
            ? ` · batch ${Math.min(batchIndex ?? 0, totalBatches)}/${totalBatches}`
            : ""}
        </span>
        {currentFile && (
          <span className="folder-picker__progress-detail">
            Now reading: {currentFile}
          </span>
        )}
        {eta && <span className="folder-picker__progress-detail">{eta}</span>}
      </>
    );
  }

  // "discovering" (or an older/missing phase) — files are already
  // appearing in Library as they're found, so this is just letting
  // someone know the walk itself is still going. There's no reliable
  // total to show a percentage against without a separate counting pass
  // over the whole tree first, so this stays indeterminate on purpose
  // rather than showing a fake number.
  return (
    <>
      <div
        className="folder-picker__progress-bar folder-picker__progress-bar--indeterminate"
        role="progressbar"
        aria-label={`Finding files in ${folder}`}
      >
        <div className="folder-picker__progress-fill" />
      </div>
      <span>
        Finding files in {folder} — {(scanned ?? 0).toLocaleString()} found
      </span>
    </>
  );
}

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
          <ScanProgressDetail scanProgress={scanProgress} />
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
