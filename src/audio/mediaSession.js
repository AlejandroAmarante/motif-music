import { getArtworkUrl } from '../db/artworkRepo.js';

const isSupported = typeof navigator !== 'undefined' && 'mediaSession' in navigator;

/** Wires the Media Session API to engine actions. Call once, at app start. */
export function setupMediaSession(engine) {
  if (!isSupported) return;
  const ms = navigator.mediaSession;

  ms.setActionHandler('play', () => engine.play());
  ms.setActionHandler('pause', () => engine.pause());
  ms.setActionHandler('previoustrack', () => engine.previous());
  ms.setActionHandler('nexttrack', () => engine.next());
  ms.setActionHandler('seekto', (details) => {
    if (details.seekTime != null) engine.seek(details.seekTime);
  });
  ms.setActionHandler('seekbackward', (details) => {
    engine.seek(Math.max(0, engine.audio.currentTime - (details.seekOffset || 10)));
  });
  ms.setActionHandler('seekforward', (details) => {
    engine.seek(engine.audio.currentTime + (details.seekOffset || 10));
  });
}

export async function updateMediaSessionMetadata(song) {
  if (!isSupported || !song) return;
  const artworkUrl = await getArtworkUrl(song.artworkId);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist,
    album: song.album || '',
    artwork: artworkUrl
      ? [
          { src: artworkUrl, sizes: '512x512', type: 'image/png' },
          { src: artworkUrl, sizes: '256x256', type: 'image/png' }
        ]
      : []
  });
}

export function updatePlaybackState(state) {
  if (!isSupported) return;
  navigator.mediaSession.playbackState = state; // 'playing' | 'paused' | 'none'
}

export function updatePositionState({ duration, position, playbackRate }) {
  if (!isSupported || !navigator.mediaSession.setPositionState) return;
  if (!Number.isFinite(duration) || duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({ duration, position, playbackRate });
  } catch {
    // Some browsers throw if position > duration by a hair during seeks; non-fatal.
  }
}
