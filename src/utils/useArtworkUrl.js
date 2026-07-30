import { useEffect, useState } from 'react';
import { getArtworkUrl } from '../db/artworkRepo.js';

export function useArtworkUrl(artworkId) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!artworkId) {
      setUrl(null);
      return;
    }
    getArtworkUrl(artworkId).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [artworkId]);

  return url;
}
