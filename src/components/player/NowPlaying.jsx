import { useState } from 'react';
import { usePlayer } from '../../state/PlayerContext.jsx';
import { useSwipe } from '../../utils/useSwipe.js';
import { useMountTransition } from '../../utils/useMountTransition.js';
import { useSmoothProgress } from '../../utils/useSmoothProgress.js';
import { Artwork } from '../common/Artwork.jsx';
import { LyricsView } from './LyricsView.jsx';
import { formatDuration } from '../../utils/formatTime.js';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

// Stops a drag control (seek bar, volume slider) from also being read as a
// screen-wide swipe gesture — without this, scrubbing left/right would skip
// tracks and dragging down would close the sheet.
const isolateDrag = { onPointerDown: (e) => e.stopPropagation() };

export function NowPlaying() {
  const {
    current,
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    playbackRate,
    shuffle,
    repeatMode,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleShuffle,
    cycleRepeat,
    nowPlayingOpen,
    closeNowPlaying
  } = usePlayer();

  const [dragValue, setDragValue] = useState(null);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const { shouldRender, entered } = useMountTransition(nowPlayingOpen, 320);
  const smoothTime = useSmoothProgress(currentTime, isPlaying, playbackRate);

  // Spotify-style: a swipe anywhere on the screen closes/skips, regardless
  // of where it starts. Drag controls opt out via isolateDrag above.
  const swipeHandlers = useSwipe({ onSwipeDown: closeNowPlaying, onSwipeLeft: next, onSwipeRight: previous });

  if (!shouldRender || !current) return null;

  const cycleSpeed = () => {
    const i = SPEEDS.indexOf(playbackRate);
    setPlaybackRate(SPEEDS[(i + 1) % SPEEDS.length]);
  };

  const displayedTime = dragValue ?? smoothTime;

  return (
    <div className={`now-playing${entered ? ' is-open' : ''}`} {...swipeHandlers}>
      <div className="now-playing__handle-zone">
        <button className="now-playing__collapse" onClick={closeNowPlaying} aria-label="Collapse Now Playing">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        <span className="now-playing__eyebrow">Playing from Library</span>
        {current.lyrics !== false ? (
          <button className="now-playing__collapse" onClick={() => setLyricsOpen(true)} aria-label="Show lyrics">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="9" y1="22" x2="15" y2="22" />
            </svg>
          </button>
        ) : (
          <div style={{ width: 22 }} />
        )}
      </div>

      <div className="now-playing__art-wrap">
        <Artwork artworkId={current.artworkId} alt={`${current.album || current.title} artwork`} className="now-playing__art" playing={isPlaying} />
      </div>

      <div className="now-playing__meta">
        <h2 className="now-playing__title">{current.title}</h2>
        <p className="now-playing__artist">{current.artist}</p>
      </div>

      <div className="now-playing__seek">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(displayedTime, duration || 0)}
          onInput={(e) => setDragValue(Number(e.target.value))}
          onChange={(e) => {
            seek(Number(e.target.value));
            setDragValue(null);
          }}
          {...isolateDrag}
          aria-label="Seek"
        />
        <div className="now-playing__times mono">
          <span>{formatDuration(displayedTime)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      <div className="now-playing__transport">
        <button
          className={`now-playing__ghost-btn${shuffle ? ' is-active' : ''}`}
          onClick={toggleShuffle}
          aria-pressed={shuffle}
          aria-label="Shuffle"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
          </svg>
        </button>

        <button className="now-playing__step-btn" onClick={previous} aria-label="Previous track">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M6 5h2v14H6zM19 5v14l-11-7z" /></svg>
        </button>

        <button className="now-playing__play-btn" onClick={toggle} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? (
            <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M7 5.5v13l11-6.5z" /></svg>
          )}
        </button>

        <button className="now-playing__step-btn" onClick={next} aria-label="Next track">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M16 5h2v14h-2zM5 5v14l11-7z" /></svg>
        </button>

        <button
          className={`now-playing__ghost-btn${repeatMode !== 'off' ? ' is-active' : ''}`}
          onClick={cycleRepeat}
          aria-label={`Repeat: ${repeatMode}`}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          {repeatMode === 'one' && <span className="now-playing__repeat-one">1</span>}
        </button>
      </div>

      <div className="now-playing__secondary">
        <button className="now-playing__speed" onClick={cycleSpeed}>{playbackRate}×</button>
        <button className="now-playing__ghost-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted || volume === 0 ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 9 8 9 13 4 13 20 8 15 3 15" /><line x1="17" y1="8" x2="22" y2="14" /><line x1="22" y1="8" x2="17" y2="14" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 9 8 9 13 4 13 20 8 15 3 15" /><path d="M17 8a5 5 0 0 1 0 8" /></svg>
          )}
        </button>
        <input
          className="now-playing__volume now-playing__volume--desktop-only"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          {...isolateDrag}
          aria-label="Volume"
        />
      </div>

      <LyricsView
        isOpen={lyricsOpen}
        onClose={() => setLyricsOpen(false)}
        song={current}
        currentTime={smoothTime}
        onSeekTo={seek}
      />
    </div>
  );
}
