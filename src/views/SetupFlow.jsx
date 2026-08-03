import { useState, useCallback, useEffect } from "react";
import {
  isFileSystemAccessSupported,
  addLibraryFolder,
  createMotifMusicFolder,
  hasMotifMusicFolder,
  scanAllFolders,
  scanFoundNoMusic,
  DuplicateFolderError,
} from "../library/libraryManager.js";
import { ensurePermission } from "../db/directoryHandlesRepo.js";
import { importSampleTrack } from "../setup/sampleTrackImport.js";
import { markSetupComplete } from "../setup/setupState.js";

function StepShell({ children }) {
  return (
    <div className="setup-flow">
      <div className="setup-flow__card">{children}</div>
    </div>
  );
}

const Mark = () => (
  <span className="motif-mark pulse" aria-hidden="true">
    <span />
    <span />
    <span />
    <span />
  </span>
);

export function SetupFlow({ onComplete }) {
  const [step, setStep] = useState("welcome");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [folderRecord, setFolderRecord] = useState(null);
  const [motifFolderTaken, setMotifFolderTaken] = useState(false);

  const supported = isFileSystemAccessSupported();

  useEffect(() => {
    hasMotifMusicFolder().then(setMotifFolderTaken);
  }, []);

  // Lets someone get into the app immediately without connecting a
  // folder. Every view already has an empty-library fallback (Home,
  // Library, Search, Queue all render a "connect a folder" prompt when
  // songCount is 0), so there's no extra state to seed here — skipping
  // just means folders is an empty array, which those views already
  // handle gracefully.
  const handleSkip = useCallback(async () => {
    await markSetupComplete();
    onComplete();
  }, [onComplete]);

  const goToFolderResult = useCallback(async (record) => {
    setFolderRecord(record);
    const stats = await scanAllFolders();
    setStep(scanFoundNoMusic(stats) ? "empty" : "done");
  }, []);

  const handleUseExisting = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const record = await addLibraryFolder();
      await goToFolderResult(record);
    } catch (err) {
      if (err?.name === "AbortError") {
        // user cancelled the picker — stay put
      } else if (err instanceof DuplicateFolderError) {
        setError(
          `“${err.existingFolder.name}” is already connected — try a different folder.`,
        );
      } else {
        setError(err.message || "Could not connect that folder.");
      }
    } finally {
      setBusy(false);
    }
  }, [goToFolderResult]);

  const handleCreateMotifFolder = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const record = await createMotifMusicFolder();
      await goToFolderResult(record);
    } catch (err) {
      if (err?.name !== "AbortError") {
        setError(err.message || "Could not create the Motif Music folder.");
      }
    } finally {
      setBusy(false);
    }
  }, [goToFolderResult]);

  const handleAddSample = useCallback(async () => {
    if (!folderRecord) {
      setStep("done");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const granted = await ensurePermission(folderRecord.handle, "readwrite");
      if (!granted)
        throw new Error("Permission to write to this folder was denied.");
      await importSampleTrack(folderRecord.handle);
      await scanAllFolders();
    } catch (err) {
      setError(err.message || "Could not add the sample track.");
      setBusy(false);
      return;
    }
    setBusy(false);
    setStep("done");
  }, [folderRecord]);

  const finish = useCallback(async () => {
    await markSetupComplete();
    onComplete();
  }, [onComplete]);

  if (step === "welcome") {
    return (
      <StepShell>
        <Mark />
        <h1 className="setup-flow__title">Welcome to Motif</h1>
        <p className="setup-flow__body">
          Your library, not a subscription. Motif plays music straight from your
          device — nothing is uploaded, copied, or streamed from somewhere else.
          Let's get your library connected.
        </p>
        <button className="setup-flow__cta" onClick={() => setStep("compat")}>
          Get Started
        </button>
        <button className="setup-flow__secondary" onClick={handleSkip}>
          Skip Setup
        </button>
      </StepShell>
    );
  }

  if (step === "compat") {
    return (
      <StepShell>
        <h1 className="setup-flow__title">Checking your browser</h1>
        {supported ? (
          <>
            <p className="setup-flow__body">
              You're all set — this browser supports the File System Access API,
              which Motif uses to read your music directly from disk.
            </p>
            <button
              className="setup-flow__cta"
              onClick={() => setStep("folder")}
            >
              Continue
            </button>
          </>
        ) : (
          <>
            <p className="setup-flow__body setup-flow__body--warning">
              Motif requires a Chromium-based browser such as Chrome, Edge, or
              Brave to access your local music folder. This browser doesn't
              support the File System Access API, so Motif can't read or manage
              local files here.
            </p>
            <p className="setup-flow__body">
              Open this page in a supported browser to continue.
            </p>
          </>
        )}
        <button className="setup-flow__secondary" onClick={handleSkip}>
          Skip Setup
        </button>
      </StepShell>
    );
  }

  if (step === "folder") {
    return (
      <StepShell>
        <h1 className="setup-flow__title">Set up your music folder</h1>
        <p className="setup-flow__body">
          Choose an existing folder of music, or let Motif create one for you.
        </p>
        {error && <p className="setup-flow__error">{error}</p>}
        <div className="setup-flow__options">
          <button
            className="setup-flow__option"
            onClick={handleUseExisting}
            disabled={busy}
          >
            <span className="setup-flow__option-title">
              Use Existing Folder
            </span>
            <span className="setup-flow__option-desc">
              Point Motif at a folder of music you already have.
            </span>
          </button>
          {!motifFolderTaken && (
            <button
              className="setup-flow__option"
              onClick={handleCreateMotifFolder}
              disabled={busy}
            >
              <span className="setup-flow__option-title">
                Create Motif Music Folder
              </span>
              <span className="setup-flow__option-desc">
                Motif creates a fresh "motif-music" folder for you to fill.
              </span>
            </button>
          )}
        </div>
        {busy && (
          <p className="setup-flow__status">
            <Mark /> Setting things up…
          </p>
        )}
        <button className="setup-flow__secondary" onClick={handleSkip}>
          Skip Setup
        </button>
      </StepShell>
    );
  }

  if (step === "empty") {
    return (
      <StepShell>
        <h1 className="setup-flow__title">Your music folder is empty</h1>
        <p className="setup-flow__body">
          Would you like to add a sample track to test playback? You can always
          add your own music to this folder later.
        </p>
        {error && <p className="setup-flow__error">{error}</p>}
        <div className="setup-flow__actions">
          <button
            className="setup-flow__cta"
            onClick={handleAddSample}
            disabled={busy}
          >
            Add sample track
          </button>
          <button
            className="setup-flow__secondary"
            onClick={() => setStep("done")}
            disabled={busy}
          >
            Skip
          </button>
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell>
      <h1 className="setup-flow__title">You're all set</h1>
      <p className="setup-flow__body">
        Motif is ready. Head in and start listening.
      </p>
      <button className="setup-flow__cta" onClick={finish}>
        Enter Motif
      </button>
    </StepShell>
  );
}
