import { memo, useState } from 'react';
import { formatDuration } from '../../utils/formatTime.js';
import { toggleFavorite, removeById } from '../../db/songsRepo.js';
import { notifyLibraryChanged } from '../../state/libraryBus.js';
import { Artwork } from '../common/Artwork.jsx';

function SongRowInner({ song, style, isPlaying, activelyPlaying, onPlay }) {
  const [favorite, setFavorite] = useState(song?.favorite ?? false);
  const [removed, setRemoved] = useState(false);

  if (!song || removed) {
    return (
      <div className="song-row song-row--placeholder" style={style}>
        {!removed && <div className="song-row__skeleton" />}
      </div>
    );
  }

  const missing = Boolean(song.missing);

  return (
    <div
      className={`song-row${isPlaying ? ' is-playing' : ''}${missing ? ' is-missing' : ''}`}
      style={style}
      onClick={onPlay}
      role="button"
      tabIndex={0}
    >
      <Artwork artworkId={song.artworkId} alt="" className="song-row__art" playing={activelyPlaying} />
      <div className="song-row__text">
        <p className="song-row__title">{song.title}</p>
        <p className="song-row__artist">
          {missing ? 'Unavailable — file not found' : `${song.artist}${song.album ? ` · ${song.album}` : ''}`}
        </p>
      </div>
      {!missing && <span className="song-row__duration mono">{formatDuration(song.duration)}</span>}
      {missing ? (
        <button
          className="song-row__remove"
          onClick={(e) => {
            e.stopPropagation();
            removeById(song.id).then(() => {
              setRemoved(true);
              notifyLibraryChanged();
            });
          }}
          aria-label={`Remove ${song.title} — file unavailable`}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6h14z" /></svg>
        </button>
      ) : (
        <button
          className={`song-row__fav${favorite ? ' is-active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setFavorite((f) => !f);
            toggleFavorite(song.id);
          }}
          aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={favorite}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
            <path d="M12 21s-7.5-4.6-10-9.2C.5 8 2.3 4.5 6 4c2.1-.3 4 .8 6 3 2-2.2 3.9-3.3 6-3 3.7.5 5.5 4 4 7.8-2.5 4.6-10 9.2-10 9.2z" />
          </svg>
        </button>
      )}
    </div>
  );
}

export const SongRow = memo(SongRowInner);
