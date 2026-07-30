import { useEffect, useState } from 'react';
import { FolderPicker } from '../components/library/FolderPicker.jsx';

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
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb > 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

export function SettingsView({ onClose }) {
  const estimate = useStorageEstimate();

  return (
    <div className="settings-overlay">
      <div className="now-playing__handle-zone">
        <button className="now-playing__collapse" onClick={onClose} aria-label="Close settings">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        <span className="now-playing__eyebrow">Settings</span>
        <div style={{ width: 22 }} />
      </div>

      <div className="view__scroll scroll-region settings-overlay__body">
        <section>
          <h3 className="home-rail__title">Library folders</h3>
          <FolderPicker />
        </section>

        {estimate && (
          <section>
            <h3 className="home-rail__title">Storage</h3>
            <p className="settings-overlay__storage mono">
              {formatBytes(estimate.usage)} used of {formatBytes(estimate.quota)} available
            </p>
            <p className="settings-overlay__note">
              This is metadata, artwork, and app cache only — your audio files stay on disk and are never copied.
            </p>
          </section>
        )}

        <section>
          <h3 className="home-rail__title">About</h3>
          <p className="settings-overlay__note">Motif — local-first music. Your library, not a subscription.</p>
        </section>
      </div>
    </div>
  );
}
