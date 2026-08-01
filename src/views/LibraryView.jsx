import { useState, useEffect, useRef, useCallback } from 'react';
import { SongList } from '../components/library/SongList.jsx';
import { useLibrary } from '../state/LibraryContext.jsx';
import { search } from '../search/searchIndex.js';
import { getByAlbumId } from '../db/songsRepo.js';

export function LibraryView({ onOpenFolders }) {
  const { version, songCount, folders, addFolder, supported } = useLibrary();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState({ songs: [], albums: [] });
  const [albumFilter, setAlbumFilter] = useState(null); // { id, name } | null
  const [albumSongs, setAlbumSongs] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setMatches({ songs: [], albums: [] });
      return;
    }
    debounceRef.current = setTimeout(() => {
      search(query, version).then((r) => setMatches({ songs: r.songs, albums: r.albums }));
    }, 120);
    return () => clearTimeout(debounceRef.current);
  }, [query, version]);

  const selectAlbum = useCallback((album) => {
    setAlbumFilter(album);
    setQuery('');
    getByAlbumId(album.id).then(setAlbumSongs);
  }, []);

  const clearAlbumFilter = useCallback(() => {
    setAlbumFilter(null);
    setAlbumSongs(null);
  }, []);

  const isFiltering = query.trim().length > 0 || albumFilter != null;
  const overrideSongs = albumFilter ? albumSongs ?? [] : query.trim() ? matches.songs : null;

  const emptyState =
    isFiltering ? (
      `No songs match “${albumFilter ? albumFilter.name : query}.”`
    ) : songCount === 0 && folders.length === 0 ? (
      <div className="library-view__empty">
        <p>No folders connected yet.</p>
        {supported && (
          <button className="library-view__empty-cta" onClick={addFolder}>
            Connect a folder
          </button>
        )}
      </div>
    ) : (
      'Songs you add will show up here, sorted by title.'
    );

  return (
    <div className="view library-view">
      <header className="view__header">
        <h1>Library</h1>
        <button className="view__header-action" onClick={onOpenFolders} aria-label="Manage connected folders">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
          </svg>
        </button>
      </header>

      <div className="library-view__search">
        <div className="search-view__input-wrap">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10.5" cy="10.5" r="6.5" /><line x1="20" y1="20" x2="15.3" y2="15.3" /></svg>
          <input
            className="search-view__input"
            type="search"
            inputMode="search"
            placeholder="Filter your library"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (albumFilter) clearAlbumFilter();
            }}
            autoComplete="off"
          />
        </div>

        {albumFilter && (
          <div className="library-view__chips">
            <button className="library-view__chip library-view__chip--active" onClick={clearAlbumFilter}>
              {albumFilter.name}
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" /></svg>
            </button>
          </div>
        )}

        {!albumFilter && query.trim() && matches.albums.length > 0 && (
          <div className="library-view__chips scroll-region">
            {matches.albums.map((album) => (
              <button key={album.id} className="library-view__chip" onClick={() => selectAlbum(album)}>
                {album.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <SongList
        version={version}
        sortIndex="byTitleLower"
        overrideSongs={overrideSongs}
        emptyState={emptyState}
      />
    </div>
  );
}
