import { useEffect, useState } from "react";
import { getArtworkUrl, peekArtworkUrl } from "../db/artworkRepo.js";

/**
 * Reads synchronously from the in-memory URL cache on mount (via
 * peekArtworkUrl) instead of always starting at null and resolving a tick
 * later — an already-resolved artworkId now renders correctly on the very
 * first paint instead of flashing fallback → image every time a component
 * using it happens to remount.
 */
export function useArtworkUrl(artworkId) {
  const [url, setUrl] = useState(() => peekArtworkUrl(artworkId));

  useEffect(() => {
    let cancelled = false;
    if (!artworkId) {
      setUrl(null);
      return undefined;
    }
    const cached = peekArtworkUrl(artworkId);
    if (cached) {
      setUrl(cached);
      return undefined;
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
