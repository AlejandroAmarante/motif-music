import { useArtworkUrl } from '../../utils/useArtworkUrl.js';

/**
 * `playing` should only be passed from contexts tied to actual playback
 * state (Now Playing, mini-player, the active row in a song/queue list).
 * Everywhere else, the fallback stays static — a pulsing "loading" glyph
 * on every artworkless row in a scrolling list reads as noise, not signal.
 */
export function Artwork({ artworkId, alt, className = '', playing = false }) {
  const url = useArtworkUrl(artworkId);
  if (url) {
    return <img src={url} alt={alt} className={`artwork ${className}`} />;
  }
  return (
    <div className={`artwork artwork--fallback ${className}`} role="img" aria-label={alt}>
      <span className={`motif-mark ${playing ? 'pulse' : 'static'}`} aria-hidden="true">
        <span /><span /><span /><span />
      </span>
    </div>
  );
}
