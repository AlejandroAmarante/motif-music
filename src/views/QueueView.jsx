import { useState, useCallback } from "react";
import { X, Repeat } from "lucide-react";
import { usePlayer } from "../state/PlayerContext.jsx";
import { Artwork } from "../components/common/Artwork.jsx";
import { formatDuration } from "../utils/formatTime.js";

const REMOVE_ANIM_MS = 220;

export function QueueView() {
  const {
    queueSongs,
    queueIndex,
    current,
    isPlaying,
    playFromQueue,
    removeFromQueue,
    shuffle,
    repeatMode,
  } = usePlayer();
  const [removingKeys, setRemovingKeys] = useState(() => new Set());

  const handleRemove = useCallback(
    (position, key) => {
      setRemovingKeys((prev) => new Set(prev).add(key));
      setTimeout(() => {
        removeFromQueue(position);
        setRemovingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, REMOVE_ANIM_MS);
    },
    [removeFromQueue],
  );

  if (!queueSongs.length) {
    return (
      <div className="view queue-view">
        <header className="view__header">
          <h1>Queue</h1>
        </header>
        <div className="view__scroll scroll-region">
          <p className="search-view__empty">
            Nothing queued yet — play something from your Library to start a
            queue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="view queue-view">
      <header className="view__header">
        <h1>Queue</h1>
        <span className="queue-view__mode mono">
          {shuffle ? "shuffle" : "in order"}
          {repeatMode !== "off" ? ` · repeat ${repeatMode}` : ""}
        </span>
      </header>
      <div className="view__scroll scroll-region">
        <h2 className="home-rail__title">Now playing</h2>
        {current && (
          <div className="search-result search-result--current">
            <Artwork
              song={current}
              alt=""
              className="search-result__art"
              playing={isPlaying}
            />
            <div className="song-row__text">
              <p className="song-row__title">{current.title}</p>
              <p className="song-row__artist">{current.artist}</p>
            </div>
            <span className="song-row__duration mono">
              {formatDuration(current.duration)}
            </span>
          </div>
        )}

        <h2 className="home-rail__title">Next up</h2>
        {repeatMode === "one" && current && (
          <div className="search-result queue-view__repeat-row">
            <Artwork
              song={current}
              alt=""
              className="search-result__art"
              playing={false}
            />
            <div className="song-row__text">
              <p className="song-row__title">{current.title}</p>
              <p className="song-row__artist">{current.artist}</p>
            </div>
            <span className="queue-view__repeat-badge">
              <Repeat size={14} strokeWidth={2} />
              Repeats
            </span>
          </div>
        )}
        {queueSongs.slice(queueIndex + 1).map((song, i) => {
          const position = queueIndex + 1 + i;
          const key = `${song.id}-${position}`;
          return (
            <div
              key={key}
              className={`search-result queue-view__row${removingKeys.has(key) ? " is-removing" : ""}`}
              onClick={() => playFromQueue(position)}
              role="button"
              tabIndex={0}
            >
              <Artwork
                song={song}
                alt=""
                className="search-result__art"
                playing={false}
              />
              <div className="song-row__text">
                <p className="song-row__title">{song.title}</p>
                <p className="song-row__artist">{song.artist}</p>
              </div>
              <button
                className="queue-view__remove"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(position, key);
                }}
                aria-label={`Remove ${song.title} from queue`}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          );
        })}
        {repeatMode !== "one" && queueSongs.length - queueIndex - 1 === 0 && (
          <p className="search-view__empty">End of queue.</p>
        )}
      </div>
    </div>
  );
}
