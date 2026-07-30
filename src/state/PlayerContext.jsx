import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AudioEngine } from '../audio/AudioEngine.js';
import { setupMediaSession } from '../audio/mediaSession.js';

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();
  const engine = engineRef.current;

  const [state, setState] = useState(() => engine.getState());
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);

  useEffect(() => {
    setupMediaSession(engine);
    return engine.onChange(setState);
  }, [engine]);

  const playSongs = useCallback((songs, startAt = 0) => engine.playQueue(songs, startAt), [engine]);

  const value = {
    engine,
    ...state,
    playSongs,
    toggle: () => engine.toggle(),
    next: () => engine.next(),
    previous: () => engine.previous(),
    seek: (t) => engine.seek(t),
    setVolume: (v) => engine.setVolume(v),
    toggleMute: () => engine.toggleMute(),
    setPlaybackRate: (r) => engine.setPlaybackRate(r),
    toggleShuffle: () => engine.toggleShuffle(),
    cycleRepeat: () => engine.cycleRepeat(),
    playNext: (song) => engine.playNext(song),
    addToQueue: (song) => engine.addToQueue(song),
    playFromQueue: (pos) => engine.playFromQueue(pos),
    removeFromQueue: (pos) => engine.removeFromQueue(pos),
    nowPlayingOpen,
    openNowPlaying: () => setNowPlayingOpen(true),
    closeNowPlaying: () => setNowPlayingOpen(false)
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within <PlayerProvider>');
  return ctx;
}
