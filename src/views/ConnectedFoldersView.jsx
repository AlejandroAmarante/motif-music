import { ChevronDown } from "lucide-react";
import { FolderPicker } from "../components/library/FolderPicker.jsx";
import { Toggle } from "../components/common/Toggle.jsx";
import { useMountTransition } from "../utils/useMountTransition.js";
import { useLibrary } from "../state/LibraryContext.jsx";

const SCAN_OPTIONS = [
  { value: "manual", label: "Manual only" },
  { value: "startup", label: "On app startup" },
  { value: "interval-5", label: "Every few minutes" },
  { value: "interval-60", label: "Every hour" },
  { value: "watch", label: "Watch for changes (experimental)" },
];

export function ConnectedFoldersView({ isOpen, onClose }) {
  const {
    scanMode,
    setScanMode,
    autoRemoveMissing,
    setAutoRemoveMissing,
    watchSupported,
  } = useLibrary();
  const { shouldRender, entered } = useMountTransition(isOpen, 280);

  if (!shouldRender) return null;

  return (
    <div className={`settings-overlay${entered ? " is-open" : ""}`}>
      <div className="now-playing__handle-zone">
        <button
          className="now-playing__collapse"
          onClick={onClose}
          aria-label="Close connected folders"
        >
          <ChevronDown size={22} strokeWidth={2} />
        </button>
        <span className="now-playing__eyebrow">Connected Folders</span>
        <div className="now-playing__spacer" />
      </div>

      <div className="view__scroll scroll-region settings-overlay__body">
        <section>
          <h2 className="home-rail__title">Folders</h2>
          <FolderPicker />
        </section>

        <section>
          <h2 className="home-rail__title">Rescan frequency</h2>
          <select
            className="connected-folders__select"
            value={scanMode}
            onChange={(e) => setScanMode(e.target.value)}
          >
            {SCAN_OPTIONS.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                disabled={opt.value === "watch" && !watchSupported}
              >
                {opt.label}
                {opt.value === "watch" && !watchSupported
                  ? " — unsupported here"
                  : ""}
              </option>
            ))}
          </select>
          <p className="settings-overlay__note">
            Controls how often Motif checks your connected folders for new,
            changed, or removed files. More frequent checks cost a bit more
            battery and CPU; manual is the lightest option.
          </p>
        </section>

        <section>
          <h2 className="home-rail__title">Missing files</h2>
          <Toggle
            id="auto-remove-missing"
            checked={autoRemoveMissing}
            onChange={setAutoRemoveMissing}
            label="Automatically remove unavailable songs"
            description="Off by default: unreachable files are greyed out in Library so you can remove them yourself."
          />
        </section>
      </div>
    </div>
  );
}
