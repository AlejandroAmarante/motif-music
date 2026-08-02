import { useState, useEffect, useRef, useCallback } from "react";
import { Search } from "lucide-react";
import { search } from "../search/searchIndex.js";
import { useLibrary } from "../state/LibraryContext.jsx";
import { usePlayer } from "../state/PlayerContext.jsx";
import { Artwork } from "../components/common/Artwork.jsx";

const RECENTS_KEY = "motif:recentSearches";
const MAX_RECENTS = 8;

function loadRecents() {
  try {
    return JSON.parse(sessionStorage.getItem(RECENTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecents(list) {
  sessionStorage.setItem(
    RECENTS_KEY,
    JSON.stringify(list.slice(0, MAX_RECENTS)),
  );
}

export function SearchView() {
  const { version } = useLibrary();
  const { playSongs } = usePlayer();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({
    songs: [],
    artists: [],
    albums: [],
  });
  const [recents, setRecents] = useState(loadRecents);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults({ songs: [], artists: [], albums: [] });
      return;
    }
    debounceRef.current = setTimeout(() => {
      search(query, version).then(setResults);
    }, 120);
    return () => clearTimeout(debounceRef.current);
  }, [query, version]);

  const commitRecent = useCallback((term) => {
    if (!term.trim()) return;
    setRecents((prev) => {
      const next = [term, ...prev.filter((t) => t !== term)].slice(
        0,
        MAX_RECENTS,
      );
      saveRecents(next);
      return next;
    });
  }, []);

  const playSong = (song) => {
    commitRecent(query);
    playSongs([song], 0);
  };

  return (
    <div className="view search-view">
      <header className="view__header">
        <h1>Search</h1>
      </header>

      <div className="library-view__search">
        <div className="search-view__input-wrap">
          <Search size={17} strokeWidth={2} />
          <input
            className="search-view__input"
            type="search"
            inputMode="search"
            placeholder="Songs, artists, albums"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => commitRecent(query)}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="view__scroll scroll-region">
        {!query.trim() && recents.length > 0 && (
          <section className="search-view__recents">
            <h2 className="home-rail__title">Recent searches</h2>
            {recents.map((term) => (
              <button
                key={term}
                className="search-view__recent-item"
                onClick={() => setQuery(term)}
              >
                {term}
              </button>
            ))}
          </section>
        )}

        {results.songs.length > 0 && (
          <section>
            <h2 className="home-rail__title">Songs</h2>
            {results.songs.map((song) => (
              <div
                key={song.id}
                className="search-result"
                onClick={() => playSong(song)}
                role="button"
                tabIndex={0}
              >
                <Artwork
                  artworkId={song.artworkId}
                  alt=""
                  className="search-result__art"
                />
                <div className="song-row__text">
                  <p className="song-row__title">{song.title}</p>
                  <p className="song-row__artist">
                    {song.artist}
                    {song.album ? ` · ${song.album}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </section>
        )}

        {results.artists.length > 0 && (
          <section>
            <h2 className="home-rail__title">Artists</h2>
            {results.artists.map((artist) => (
              <div
                key={artist.id}
                className="search-result search-result--text"
              >
                {artist.name}
              </div>
            ))}
          </section>
        )}

        {results.albums.length > 0 && (
          <section>
            <h2 className="home-rail__title">Albums</h2>
            {results.albums.map((album) => (
              <div key={album.id} className="search-result search-result--text">
                {album.name}
              </div>
            ))}
          </section>
        )}

        {query.trim() &&
          !results.songs.length &&
          !results.artists.length &&
          !results.albums.length && (
            <p className="search-view__empty">
              No matches for "{query}" in your library.
            </p>
          )}
      </div>
    </div>
  );
}
