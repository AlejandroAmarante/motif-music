// src/views/DetailOverlay.jsx — NEW
import { ChevronDown, ChevronLeft } from "lucide-react";
import { useMountTransition } from "../utils/useMountTransition.js";
import { useNavigation } from "../state/NavigationContext.jsx";
import { ArtistView } from "./ArtistView.jsx";
import { AlbumView } from "./AlbumView.jsx";

/**
 * Hosts the Artist and Album views as a small back-navigable stack (see
 * NavigationContext). Reuses the same slide-up full-screen treatment as
 * Settings/Connected Folders (`.settings-overlay`), but its own back
 * button floats over the content instead of pushing it down, so an
 * artist's hero photo can run edge-to-edge behind it.
 */
export function DetailOverlay() {
  const { stack, current, goBack, closeAll } = useNavigation();
  const isOpen = stack.length > 0;
  const { shouldRender, entered } = useMountTransition(isOpen, 280);

  if (!shouldRender || !current) return null;

  const canGoBack = stack.length > 1;

  return (
    <div
      className={`settings-overlay detail-overlay${entered ? " is-open" : ""}`}
    >
      <button
        className="detail-overlay__back"
        onClick={canGoBack ? goBack : closeAll}
        aria-label={canGoBack ? "Back" : "Close"}
      >
        {canGoBack ? (
          <ChevronLeft size={22} strokeWidth={2} />
        ) : (
          <ChevronDown size={22} strokeWidth={2} />
        )}
      </button>

      <div className="view__scroll scroll-region detail-overlay__body">
        {current.type === "artist" ? (
          <ArtistView key={current.id} artistId={current.id} />
        ) : (
          <AlbumView key={current.id} albumId={current.id} />
        )}
      </div>
    </div>
  );
}
