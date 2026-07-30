import { usePlayer } from '../../state/PlayerContext.jsx';
import { useSwipe } from '../../utils/useSwipe.js';
import { Artwork } from '../common/Artwork.jsx';

export function MiniPlayer() {
  const { current, isPlaying, buffering, currentTime, duration, toggle, next, previous, openNowPlaying } =
    usePlayer();

  const swipeHandlers = useSwipe({
    onSwipeUp: openNowPlaying,
    onSwipeLeft: next,
    onSwipeRight: previous,
    onTap: openNowPlaying
  });

  if (!current) return null;

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div className="mini-player" role="button" tabIndex={0} aria-label={`Now playing: ${current.title}. Tap to expand.`} {...swipeHandlers}>
      <div className="mini-player__progress" style={{ transform: `scaleX(${progress})` }} />
      <Artwork artworkId={current.artworkId} alt="" className="mini-player__art" />
      <div className="mini-player__text">
        <p className="mini-player__title">{current.title}</p>
        <p className="mini-player__artist">{current.artist}</p>
      </div>
      <button
        className="mini-player__play"
        aria-label={isPlaying ? 'Pause' : 'Play'}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        {buffering ? (
          <span className="motif-mark pulse" aria-hidden="true"><span /><span /><span /><span /></span>
        ) : isPlaying ? (
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M7 5.5v13l11-6.5z" /></svg>
        )}
      </button>
    </div>
  );
}
