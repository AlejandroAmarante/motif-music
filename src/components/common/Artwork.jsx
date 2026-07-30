import { useArtworkUrl } from '../../utils/useArtworkUrl.js';

export function Artwork({ artworkId, alt, className = '' }) {
  const url = useArtworkUrl(artworkId);
  if (url) {
    return <img src={url} alt={alt} className={`artwork ${className}`} />;
  }
  return (
    <div className={`artwork artwork--fallback ${className}`} role="img" aria-label={alt}>
      <span className="motif-mark pulse" aria-hidden="true">
        <span /><span /><span /><span />
      </span>
    </div>
  );
}
