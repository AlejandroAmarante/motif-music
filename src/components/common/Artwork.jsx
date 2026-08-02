import { useEffect, useState } from 'react';
import { useArtworkUrl } from '../../utils/useArtworkUrl.js';
import { resolveAlbumArtwork, albumArtworkContext } from '../../artwork/artworkManager.js';

/**
 * The fallback glyph and the loaded image are both always mounted, stacked,
 * with the image crossfading in via opacity — never a mount/unmount swap
 * between two different element types. That swap (img <-> div) is what
 * turns any transient `url` instability into a visible flash; crossfading
 * makes the same instability invisible or at worst a soft dissolve.
 */
export function Artwork({ artworkId, song, alt, className = '', playing = false }) {
  const knownId = artworkId ?? song?.artworkId ?? null;
  const [resolved, setResolved] = useState(null); // { artworkId } | { artworkUrl } | null

  useEffect(() => {
    setResolved(null);
    if (knownId || !song) return undefined;

    const ctx = albumArtworkContext(song);
    if (!ctx?.albumKey) return undefined;

    let cancelled = false;
    resolveAlbumArtwork(ctx).then((result) => {
      if (!cancelled && result) setResolved(result);
    });
    return () => {
      cancelled = true;
    };
    // Deliberately depends on primitive identifiers, not the `song` object
    // reference — a freshly-refetched-but-otherwise-identical song object
    // must not be treated as "a different song to resolve".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownId, song?.albumId, song?.id]);

  const localUrl = useArtworkUrl(knownId ?? resolved?.artworkId ?? null);
  const url = localUrl || resolved?.artworkUrl || null;

  return (
    <div className={`artwork-wrap ${className}`}>
      <div className="artwork artwork--fallback" role="img" aria-label={alt}>
        <span className={`motif-mark ${playing ? 'pulse' : 'static'}`} aria-hidden="true">
          <span /><span /><span /><span />
        </span>
      </div>
      <img src={url || ''} alt={alt} className={`artwork artwork--loaded${url ? ' is-visible' : ''}`} />
    </div>
  );
}