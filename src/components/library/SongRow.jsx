import { memo, useState } from 'react';
import { formatDuration } from '../../utils/formatTime.js';
import { toggleFavorite } from '../../db/songsRepo.js';
import { Artwork } from '../common/Artwork.jsx';

function SongRowInner({ song, style, isPlaying, onPlay }) {
  const [favorite, setFavorite] = useState(song?.favorite ?? false);

  if (!song) {
    return (
      <div className="song-row song-row--placeholder" style={style}>
        <div className="song-row__skeleton" />
      </div>
    );
  }

  return (
    <div className={`song-row${isPlaying ? ' is-playing' : ''}`} style={style} onClick={onPlay} role="button" tabIndex={0}>
      <Artwork artworkId={song.artworkId} alt="" className="song-row__art" />
      <div className="song-row__text">
        <p className="song-row__title">{song.title}</p>
        <p className="song-row__artist">{song.artist}{song.album ? ` · ${song.album}` : ''}</p>
      </div>
      <span className="song-row__duration mono">{formatDuration(song.duration)}</span>
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
        <svg viewBox="0 0 24 24" width="18" height="18" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
          <path d="M12 21s-7.5-4.6-10-9.2C.5 8 2.3 4.5 6 4c2.1-.3 4 .8 6 3 2-2.2 3.9-3.3 6-3 3.7.5 5.5 4 4 7.8-2.5 4.6-10 9.2-10 9.2z" />
        </svg>
      </button>
    </div>
  );
}

export const SongRow = memo(SongRowInner);
