// src/components/library/SongRow.jsx — full updated file
import { memo, useEffect, useState } from "react";
import { Trash2, Heart, Download } from "lucide-react";
import { formatDuration } from "../../utils/formatTime.js";
import { toggleFavorite, removeById } from "../../db/songsRepo.js";
import { notifyLibraryChanged } from "../../state/libraryBus.js";
import { onSongUpdated } from "../../state/songUpdateBus.js";
import { Artwork } from "../common/Artwork.jsx";

function SongRowInner({
  song,
  style,
  isPlaying,
  activelyPlaying,
  onPlay,
  index,
}) {
  // A local, live copy rather than reading `song` directly — this is what
  // lets the row flip from pending to ready the instant scanner.js
  // finishes enriching it, without waiting on (or forcing) a refetch of
  // the whole virtualized list. See songUpdateBus.js.
  const [liveSong, setLiveSong] = useState(song);
  const [favorite, setFavorite] = useState(song?.favorite ?? false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    setLiveSong(song);
    if (song) setFavorite(Boolean(song.favorite));
  }, [song]);

  useEffect(() => {
    if (!song?.id) return undefined;
    return onSongUpdated(song.id, (updated) => {
      setLiveSong(updated);
      setFavorite(Boolean(updated.favorite));
    });
  }, [song?.id]);

  if (!liveSong || removed) {
    return (
      <div className="song-row song-row--placeholder" style={style}>
        {!removed && <div className="song-row__skeleton" />}
      </div>
    );
  }

  const missing = Boolean(liveSong.missing);
  const pending = Boolean(liveSong.pending);

  return (
    <div
      className={`song-row${isPlaying ? " is-playing" : ""}${missing ? " is-missing" : ""}${pending ? " is-pending" : ""}`}
      style={style}
      onClick={() => {
        if (!pending) onPlay(index);
      }}
      role="button"
      tabIndex={0}
      aria-disabled={pending || undefined}
    >
      <Artwork
        song={pending ? null : liveSong}
        alt=""
        className="song-row__art"
        playing={activelyPlaying}
      />
      <div className="song-row__text">
        <p className="song-row__title">{liveSong.title}</p>
        <p className="song-row__artist">
          {pending
            ? "Reading tags…"
            : missing
              ? "Unavailable — file not found"
              : `${liveSong.artist}${liveSong.album ? ` · ${liveSong.album}` : ""}`}
        </p>
      </div>
      {pending ? (
        <span
          className="song-row__pending"
          aria-label="Still processing this track"
        >
          <Download size={18} strokeWidth={1.8} />
        </span>
      ) : !missing ? (
        <span className="song-row__duration mono">
          {formatDuration(liveSong.duration)}
        </span>
      ) : null}
      {missing ? (
        <button
          className="song-row__remove"
          onClick={(e) => {
            e.stopPropagation();
            removeById(liveSong.id).then(() => {
              setRemoved(true);
              notifyLibraryChanged();
            });
          }}
          aria-label={`Remove ${liveSong.title} — file unavailable`}
        >
          <Trash2 size={21} strokeWidth={1.8} />
        </button>
      ) : !pending ? (
        <button
          className={`song-row__fav${favorite ? " is-active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setFavorite((f) => !f);
            toggleFavorite(liveSong.id);
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
      ) : null}
    </div>
  );
}

export const SongRow = memo(SongRowInner);
