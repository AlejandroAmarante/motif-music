import { memo, useState } from "react";
import { Trash2, Heart } from "lucide-react";
import { formatDuration } from "../../utils/formatTime.js";
import { toggleFavorite, removeById } from "../../db/songsRepo.js";
import { notifyLibraryChanged } from "../../state/libraryBus.js";
import { Artwork } from "../common/Artwork.jsx";

function SongRowInner({
  song,
  style,
  isPlaying,
  activelyPlaying,
  onPlay,
  index,
}) {
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
      className={`song-row${isPlaying ? " is-playing" : ""}${missing ? " is-missing" : ""}`}
      style={style}
      onClick={() => onPlay(index)}
      role="button"
      tabIndex={0}
    >
      <Artwork
        song={song}
        alt=""
        className="song-row__art"
        playing={activelyPlaying}
      />
      <div className="song-row__text">
        <p className="song-row__title">{song.title}</p>
        <p className="song-row__artist">
          {missing
            ? "Unavailable — file not found"
            : `${song.artist}${song.album ? ` · ${song.album}` : ""}`}
        </p>
      </div>
      {!missing && (
        <span className="song-row__duration mono">
          {formatDuration(song.duration)}
        </span>
      )}
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
          <Trash2 size={21} strokeWidth={1.8} />
        </button>
      ) : (
        <button
          className={`song-row__fav${favorite ? " is-active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setFavorite((f) => !f);
            toggleFavorite(song.id);
          }}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={favorite}
        >
          <Heart
            size={23}
            strokeWidth={1.8}
            fill={favorite ? "currentColor" : "none"}
          />
        </button>
      )}
    </div>
  );
}

export const SongRow = memo(SongRowInner);
