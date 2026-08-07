// src/views/SettingsView.jsx — full updated file (added "Artist Photos" / Last.fm key section)
import { useEffect, useState } from "react";
import {
  ChevronDown,
  Library,
  Image,
  Users,
  RefreshCw,
  HardDrive,
  RotateCcw,
  Info,
} from "lucide-react";
import { useMountTransition } from "../utils/useMountTransition.js";
import { useLibrary } from "../state/LibraryContext.jsx";
import { useUpdateManager } from "../state/UpdateContext.jsx";
import { getSetting, setSetting } from "../db/settingsRepo.js";
import { resetSetup } from "../setup/setupState.js";
import { ensurePermission } from "../db/directoryHandlesRepo.js";
import { importSampleTrack } from "../setup/sampleTrackImport.js";
import { pushToast } from "../state/toastBus.js";
import { Toggle } from "../components/common/Toggle.jsx";
import { SectionTitle } from "../components/common/SectionTitle.jsx";

function useStorageEstimate() {
  const [estimate, setEstimate] = useState(null);
  useEffect(() => {
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then(setEstimate);
    }
  }, []);
  return estimate;
}

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb > 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

export function SettingsView({ isOpen, onClose, onOpenFolders }) {
  const estimate = useStorageEstimate();
  const { shouldRender, entered } = useMountTransition(isOpen, 280);
  const [discogsToken, setDiscogsToken] = useState("");
  const [lastfmApiKey, setLastfmApiKey] = useState("");
  const [resettingSetup, setResettingSetup] = useState(false);
  const [addingSample, setAddingSample] = useState(false);
  const { supported, motifFolderExists, createMotifFolder, folders, rescan } =
    useLibrary();
  const {
    needRefresh,
    checking,
    checkForUpdate,
    applyUpdate,
    autoCheckUpdates,
    setAutoCheckUpdates,
  } = useUpdateManager();

  useEffect(() => {
    getSetting("discogsToken", "").then((v) => setDiscogsToken(v || ""));
    getSetting("lastfmApiKey", "").then((v) => setLastfmApiKey(v || ""));
  }, []);

  const handleResetSetup = async () => {
    setResettingSetup(true);
    try {
      await resetSetup();
      // resetSetup() reloads the page on success, so nothing after this
      // line normally runs — the catch below only matters if it throws
      // before getting there (e.g. IndexedDB write failure).
    } catch (err) {
      setResettingSetup(false);
      pushToast(err.message || "Couldn't reset setup — try again.", {
        type: "error",
      });
    }
  };

  // Same import used during first-run setup, just reachable any time
  // afterward too. Targets the first connected folder — good enough for
  // the common single-folder case; someone managing several folders can
  // already see which one it landed in via "Manage connected folders".
  const handleAddSampleTrack = async () => {
    if (!folders.length) return;
    setAddingSample(true);
    try {
      const target = folders[0];
      const granted = await ensurePermission(target.handle, "readwrite");
      if (!granted) {
        throw new Error("Permission to write to this folder was denied.");
      }
      await importSampleTrack(target.handle);
      await rescan();
      pushToast("Sample track added to your library.", { type: "success" });
    } catch (err) {
      pushToast(err.message || "Could not add the sample track.", {
        type: "error",
      });
    } finally {
      setAddingSample(false);
    }
  };

  if (!shouldRender) return null;

  return (
    <div className={`settings-overlay${entered ? " is-open" : ""}`}>
      <div className="now-playing__handle-zone">
        <button
          className="now-playing__collapse"
          onClick={onClose}
          aria-label="Close settings"
        >
          <ChevronDown size={25} strokeWidth={2} />
        </button>
        <span className="now-playing__eyebrow">Settings</span>
        <div className="now-playing__spacer" />
      </div>

      <div className="view__scroll scroll-region settings-overlay__body">
        <section>
          <SectionTitle icon={Library}>Library</SectionTitle>
          <button
            className="settings-overlay__sample-btn"
            onClick={onOpenFolders}
          >
            Manage connected folders
          </button>
          {supported && !motifFolderExists && (
            <button
              className="settings-overlay__sample-btn"
              style={{ marginTop: 10 }}
              onClick={createMotifFolder}
            >
              Create Motif Music Folder
            </button>
          )}
          <button
            className="settings-overlay__sample-btn"
            style={{ marginTop: 10 }}
            onClick={handleAddSampleTrack}
            disabled={addingSample || folders.length === 0}
          >
            {addingSample ? "Adding sample track…" : "Add sample track"}
          </button>
          {folders.length === 0 && (
            <p className="settings-overlay__note">
              Connect a folder above to enable this.
            </p>
          )}
        </section>

        <section>
          <SectionTitle icon={Image}>Artwork</SectionTitle>
          <p className="settings-overlay__note" style={{ marginBottom: 8 }}>
            Missing album art is looked up automatically via MusicBrainz and
            Deezer, once per album, and cached — no setup needed. Discogs is
            used only as a last resort and only if you supply your own free
            personal access token below.
          </p>
          <input
            className="settings-overlay__input"
            type="text"
            placeholder="Discogs personal access token (optional)"
            value={discogsToken}
            onChange={(e) => setDiscogsToken(e.target.value)}
            onBlur={() =>
              setSetting("discogsToken", discogsToken.trim() || null)
            }
          />
        </section>

        <section>
          <SectionTitle icon={Users}>Artist Photos</SectionTitle>
          <p className="settings-overlay__note" style={{ marginBottom: 8 }}>
            Artist tags and info come from MusicBrainz automatically. For artist
            photos specifically, add a free Last.fm API key below — without one,
            the Artist page falls back to a photo from one of the artist's own
            albums.
          </p>
          <input
            className="settings-overlay__input"
            type="text"
            placeholder="Last.fm API key (optional)"
            value={lastfmApiKey}
            onChange={(e) => setLastfmApiKey(e.target.value)}
            onBlur={() =>
              setSetting("lastfmApiKey", lastfmApiKey.trim() || null)
            }
          />
        </section>

        <section>
          <SectionTitle icon={RefreshCw}>Updates</SectionTitle>
          <div className="settings-overlay__row">
            <button
              className="settings-overlay__sample-btn"
              onClick={() => checkForUpdate()}
              disabled={checking}
            >
              {checking ? "Checking…" : "Check for Updates"}
            </button>
            {needRefresh && (
              <button
                className="settings-overlay__sample-btn"
                onClick={applyUpdate}
              >
                Refresh now
              </button>
            )}
          </div>
          <p className="settings-overlay__note" style={{ marginBottom: 8 }}>
            {needRefresh
              ? "An update has downloaded and is ready to apply."
              : "Motif checks for a new version and installs it in the background."}
          </p>
          <Toggle
            id="auto-check-updates"
            checked={autoCheckUpdates}
            onChange={setAutoCheckUpdates}
            label="Automatically check for updates"
            description="Checks hourly while Motif is open and applies updates with minimal disruption."
          />
        </section>

        {estimate && (
          <section>
            <SectionTitle icon={HardDrive}>Storage</SectionTitle>
            <p className="settings-overlay__storage mono">
              {formatBytes(estimate.usage)} used of{" "}
              {formatBytes(estimate.quota)} available
            </p>
            <p className="settings-overlay__note">
              This is metadata, artwork, and app cache only — your audio files
              stay on disk and are never copied.
            </p>
          </section>
        )}

        <section>
          <SectionTitle icon={RotateCcw}>Setup</SectionTitle>
          <button
            className="settings-overlay__sample-btn"
            onClick={handleResetSetup}
            disabled={resettingSetup}
          >
            {resettingSetup ? "Resetting…" : "Reset setup"}
          </button>
          <p className="settings-overlay__note">
            Runs the first-run setup flow again. Your connected folders and
            library stay exactly as they are — this only resets onboarding.
          </p>
        </section>

        <section>
          <SectionTitle icon={Info}>About</SectionTitle>
          <p className="settings-overlay__note">
            Local-first music. Your library, not a subscription.
          </p>
        </section>
      </div>
    </div>
  );
}
