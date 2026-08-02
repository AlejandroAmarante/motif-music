import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { useLibrary } from "../state/LibraryContext.jsx";
import { usePlayer } from "../state/PlayerContext.jsx";
import {
  getRecentlyAdded,
  getFavorites,
  getTopPlayed,
} from "../db/songsRepo.js";
import { Artwork } from "../components/common/Artwork.jsx";
import { SAMPLE_TRACKS } from "../library/sampleTracks.js";

function Rail({ title, songs, onPlay }) {
  if (!songs.length) return null;
  return (
    <section className="home-rail">
      <h2 className="home-rail__title">{title}</h2>
      <div className="home-rail__scroll scroll-region">
        {songs.map((song, i) => (
          <button
            key={song.id}
            className="home-card"
            onClick={() => onPlay(songs, i)}
          >
            <Artwork song={song} alt="" className="home-card__art" />
            <p className="home-card__title">{song.title}</p>
            <p className="home-card__artist">{song.artist}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

export function HomeView({ onOpenSettings }) {
  const { songCount, version, addFolder, supported } = useLibrary();
  const { playSongs } = usePlayer();
  const [rails, setRails] = useState({ recent: [], favorites: [], top: [] });

  useEffect(() => {
    if (songCount === 0) return;
    Promise.all([
      getRecentlyAdded(15),
      getFavorites(15),
      getTopPlayed(15),
    ]).then(([recent, favorites, top]) => setRails({ recent, favorites, top }));
  }, [songCount, version]);

  return (
    <div className="view home-view">
      <header className="view__header">
        <h1>Home</h1>
        <button
          className="view__header-action"
          onClick={onOpenSettings}
          aria-label="Settings"
        >
          <Settings size={20} strokeWidth={1.8} />
        </button>
      </header>

      <div className="view__scroll scroll-region">
        {songCount === 0 ? (
          <div className="home-empty">
            <span className="motif-mark pulse" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
            <h2>Your library is empty</h2>
            <p>
              Connect a folder of music from your device to get started. Motif
              reads it in place — nothing is copied or uploaded.
            </p>
            {supported && (
              <button className="home-empty__cta" onClick={addFolder}>
                Connect a folder
              </button>
            )}
            <button
              className="home-empty__secondary"
              onClick={() => playSongs(SAMPLE_TRACKS, 0)}
            >
              Or try three sample tracks
            </button>
          </div>
        ) : (
          <>
            <Rail
              title="Recently added"
              songs={rails.recent}
              onPlay={playSongs}
            />
            <Rail
              title="Favorites"
              songs={rails.favorites}
              onPlay={playSongs}
            />
            <Rail title="Most played" songs={rails.top} onPlay={playSongs} />
            <p className="home-view__note">
              Daily Mixes, Weekly Discovery, and Release Radar land once the
              recommendation engine is in place — for now, Home reflects your
              actual listening.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
