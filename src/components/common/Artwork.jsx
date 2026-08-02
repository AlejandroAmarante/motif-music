import { useEffect, useRef, useState } from "react";
import { useArtworkUrl } from "../../utils/useArtworkUrl.js";
import {
  resolveAlbumArtwork,
  albumArtworkContext,
} from "../../artwork/artworkManager.js";

/**
 * `playing` should only be passed from contexts tied to actual playback
 * state (Now Playing, mini-player, the active row in a song/queue list).
 * Everywhere else, the fallback stays static — a pulsing "loading" glyph
 * on every artworkless row in a scrolling list reads as noise, not signal.
 *
 * Pass `song` (the full record) rather than a bare `artworkId` when you
 * have it: if the song has no embedded artwork, this triggers the
 * album-level online lookup pipeline (deduped/cached per album — see
 * artworkManager.js) and swaps the image in once resolved.
 */
export function Artwork({
  artworkId,
  song,
  alt,
  className = "",
  playing = false,
}) {
  const knownId = artworkId ?? song?.artworkId ?? null;
  const [resolvedId, setResolvedId] = useState(null);
  const [resolvedUrl, setResolvedUrl] = useState(null);
  const lastKeyRef = useRef(null);

  useEffect(() => {
    if (knownId || !song) {
      lastKeyRef.current = null;
      setResolvedId(null);
      setResolvedUrl(null);
      return undefined;
    }

    const ctx = albumArtworkContext(song);
    if (!ctx?.albumKey) {
      lastKeyRef.current = null;
      setResolvedId(null);
      setResolvedUrl(null);
      return undefined;
    }

    // Same album this instance already resolved (consecutive tracks off the
    // same album, or just an ordinary re-render) — keep showing it. Clearing
    // state here unconditionally was the bug: it wiped correct artwork and
    // then the dedup guard below would skip re-fetching it, leaving the
    // component stuck blank until something else forced a change.
    if (ctx.albumKey === lastKeyRef.current) return undefined;

    // Genuinely a different album for this instance — clear immediately so
    // we never show the *previous* song's cover while the new one resolves.
    lastKeyRef.current = ctx.albumKey;
    setResolvedId(null);
    setResolvedUrl(null);

    let cancelled = false;
    resolveAlbumArtwork(ctx).then((result) => {
      if (cancelled) return;
      if (result?.artworkId) setResolvedId(result.artworkId);
      else if (result?.artworkUrl) setResolvedUrl(result.artworkUrl);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownId, song?.albumId, song?.id]);

  const localUrl = useArtworkUrl(knownId ?? resolvedId);
  const url = localUrl || resolvedUrl;

  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        className={`artwork artwork--loaded ${className}`}
      />
    );
  }
  return (
    <div
      className={`artwork artwork--fallback ${className}`}
      role="img"
      aria-label={alt}
    >
      <span
        className={`motif-mark ${playing ? "pulse" : "static"}`}
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
