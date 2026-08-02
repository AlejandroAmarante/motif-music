import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useMountTransition } from "../utils/useMountTransition.js";
import { useLibrary } from "../state/LibraryContext.jsx";
import { getSetting, setSetting } from "../db/settingsRepo.js";
import { resetSetup } from "../setup/setupState.js";

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
  const { supported, motifFolderExists, createMotifFolder } = useLibrary();

  useEffect(() => {
    getSetting("discogsToken", "").then((v) => setDiscogsToken(v || ""));
  }, []);

  if (!shouldRender) return null;

  return (
    <div className={`settings-overlay${entered ? " is-open" : ""}`}>
      <div className="now-playing__handle-zone">
        <button
          className="now-playing__collapse"
          onClick={onClose}
          aria-label="Close settings"
        >
          <ChevronDown size={22} strokeWidth={2} />
        </button>
        <span className="now-playing__eyebrow">Settings</span>
        <div className="now-playing__spacer" />
      </div>

      <div className="view__scroll scroll-region settings-overlay__body">
        <section>
          <h2 className="home-rail__title">Library</h2>
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
        </section>

        <section>
          <h2 className="home-rail__title">Artwork</h2>
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

        {estimate && (
          <section>
            <h2 className="home-rail__title">Storage</h2>
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
          <h2 className="home-rail__title">Setup</h2>
          <button className="settings-overlay__sample-btn" onClick={resetSetup}>
            Reset setup
          </button>
          <p className="settings-overlay__note">
            Runs the first-run setup flow again. Your connected folders and
            library stay exactly as they are — this only resets onboarding.
          </p>
        </section>

        <section>
          <h2 className="home-rail__title">About</h2>
          <p className="settings-overlay__note">
            Local-first music. Your library, not a subscription.
          </p>
        </section>
      </div>
    </div>
  );
}
