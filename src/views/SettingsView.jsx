import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useMountTransition } from "../utils/useMountTransition.js";
import { usePlayer } from "../state/PlayerContext.jsx";
import { SAMPLE_TRACKS } from "../library/sampleTracks.js";

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
  const { playSongs } = usePlayer();
  const { shouldRender, entered } = useMountTransition(isOpen, 280);

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
        <div style={{ width: 22 }} />
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
          <h2 className="home-rail__title">Test playback</h2>
          <button
            className="settings-overlay__sample-btn"
            onClick={() => playSongs(SAMPLE_TRACKS, 0)}
          >
            Play sample tracks
          </button>
          <p className="settings-overlay__note">
            Three short synthesized placeholder tones, generated locally —
            useful for confirming playback works before connecting a real
            folder.
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
