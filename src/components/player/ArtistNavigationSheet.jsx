// src/components/player/ArtistNavigationSheet.jsx — NEW
import { useMountTransition } from "../../utils/useMountTransition.js";

/**
 * Shown from Now Playing when tapping the artist name is ambiguous —
 * more than one local track by the artist, and this track has an album —
 * so "View Artist" and "View Album" are genuinely different places to go.
 * See resolveArtistNavigation() in src/library/navigation.js for when this
 * fires versus navigating directly.
 */
export function ArtistNavigationSheet({
  isOpen,
  artistName,
  onClose,
  onViewArtist,
  onViewAlbum,
}) {
  const { shouldRender, entered } = useMountTransition(isOpen, 220);

  if (!shouldRender) return null;

  return (
    <>
      <div
        className={`nav-sheet__scrim${entered ? " is-open" : ""}`}
        onClick={onClose}
        role="presentation"
      />
      <div className={`nav-sheet${entered ? " is-open" : ""}`}>
        <p className="nav-sheet__title">{artistName}</p>
        <button className="nav-sheet__option" onClick={onViewArtist}>
          View Artist
        </button>
        <button className="nav-sheet__option" onClick={onViewAlbum}>
          View Album
        </button>
        <button className="nav-sheet__cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );
}
