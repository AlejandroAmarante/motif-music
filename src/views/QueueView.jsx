import { usePlayer } from '../state/PlayerContext.jsx';
import { Artwork } from '../components/common/Artwork.jsx';
import { formatDuration } from '../utils/formatTime.js';

export function QueueView() {
  const { queueSongs, queueIndex, current, playFromQueue, removeFromQueue, shuffle, repeatMode } = usePlayer();

  if (!queueSongs.length) {
    return (
      <div className="view queue-view">
        <header className="view__header"><h1>Queue</h1></header>
        <div className="view__scroll scroll-region">
          <p className="search-view__empty">Nothing queued yet — play something from your Library to start a queue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view queue-view">
      <header className="view__header">
        <h1>Queue</h1>
        <span className="queue-view__mode mono">
          {shuffle ? 'shuffle' : 'in order'}{repeatMode !== 'off' ? ` · repeat ${repeatMode}` : ''}
        </span>
      </header>
      <div className="view__scroll scroll-region">
        <h3 className="home-rail__title">Now playing</h3>
        {current && (
          <div className="search-result search-result--current">
            <Artwork artworkId={current.artworkId} alt="" className="search-result__art" />
            <div className="song-row__text">
              <p className="song-row__title">{current.title}</p>
              <p className="song-row__artist">{current.artist}</p>
            </div>
            <span className="song-row__duration mono">{formatDuration(current.duration)}</span>
          </div>
        )}

        <h3 className="home-rail__title">Next up</h3>
        {queueSongs.slice(queueIndex + 1).map((song, i) => {
          const position = queueIndex + 1 + i;
          return (
            <div key={`${song.id}-${position}`} className="search-result" onClick={() => playFromQueue(position)} role="button" tabIndex={0}>
              <Artwork artworkId={song.artworkId} alt="" className="search-result__art" />
              <div className="song-row__text">
                <p className="song-row__title">{song.title}</p>
                <p className="song-row__artist">{song.artist}</p>
              </div>
              <button
                className="queue-view__remove"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromQueue(position);
                }}
                aria-label={`Remove ${song.title} from queue`}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" /></svg>
              </button>
            </div>
          );
        })}
        {queueSongs.length - queueIndex - 1 === 0 && <p className="search-view__empty">End of queue.</p>}
      </div>
    </div>
  );
}
