import { useEffect, useState } from 'react';
import { useLibrary } from '../state/LibraryContext.jsx';
import { usePlayer } from '../state/PlayerContext.jsx';
import { getRecentlyAdded, getFavorites, getTopPlayed } from '../db/songsRepo.js';
import { Artwork } from '../components/common/Artwork.jsx';

function Rail({ title, songs, onPlay }) {
  if (!songs.length) return null;
  return (
    <section className="home-rail">
      <h3 className="home-rail__title">{title}</h3>
      <div className="home-rail__scroll scroll-region">
        {songs.map((song, i) => (
          <button key={song.id} className="home-card" onClick={() => onPlay(songs, i)}>
            <Artwork artworkId={song.artworkId} alt="" className="home-card__art" />
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
    Promise.all([getRecentlyAdded(15), getFavorites(15), getTopPlayed(15)]).then(([recent, favorites, top]) =>
      setRails({ recent, favorites, top })
    );
  }, [songCount, version]);

  return (
    <div className="view home-view">
      <header className="view__header">
        <h1>Motif</h1>
        <button className="view__header-action" onClick={onOpenSettings} aria-label="Settings">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
          </svg>
        </button>
      </header>

      <div className="view__scroll scroll-region">
        {songCount === 0 ? (
          <div className="home-empty">
            <span className="motif-mark pulse" aria-hidden="true"><span /><span /><span /><span /></span>
            <h2>Your library is empty</h2>
            <p>Connect a folder of music from your device to get started. Motif reads it in place — nothing is copied or uploaded.</p>
            {supported && (
              <button className="home-empty__cta" onClick={addFolder}>
                Connect a folder
              </button>
            )}
          </div>
        ) : (
          <>
            <Rail title="Recently added" songs={rails.recent} onPlay={playSongs} />
            <Rail title="Favorites" songs={rails.favorites} onPlay={playSongs} />
            <Rail title="Most played" songs={rails.top} onPlay={playSongs} />
            <p className="home-view__note">
              Daily Mixes, Weekly Discovery, and Release Radar land once the recommendation engine is in place —
              for now, Home reflects your actual listening.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
