import { useState, useCallback } from "react";
import { Search, FolderCog, X } from "lucide-react";
import { SongList } from "../components/library/SongList.jsx";
import { useLibrary } from "../state/LibraryContext.jsx";
import { useDebouncedSearch } from "../state/useDebouncedSearch.js";
import { getByAlbumId } from "../db/songsRepo.js";

export function LibraryView({ onOpenFolders }) {
  const { version, songCount, folders, addFolder, supported } = useLibrary();
  const [query, setQuery] = useState("");
  const matches = useDebouncedSearch(query, version);
  const [albumFilter, setAlbumFilter] = useState(null); // { id, name } | null
  const [albumSongs, setAlbumSongs] = useState(null);

  const selectAlbum = useCallback((album) => {
    setAlbumFilter(album);
    setQuery("");
    getByAlbumId(album.id).then(setAlbumSongs);
  }, []);

  const clearAlbumFilter = useCallback(() => {
    setAlbumFilter(null);
    setAlbumSongs(null);
  }, []);

  const isFiltering = query.trim().length > 0 || albumFilter != null;
  const overrideSongs = albumFilter
    ? (albumSongs ?? [])
    : query.trim()
      ? matches.songs
      : null;

  const emptyState = isFiltering ? (
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
    "Songs you add will show up here, sorted by title."
  );

  return (
    <div className="view library-view">
      <header className="view__header">
        <h1>Library</h1>
        <button
          className="view__header-action"
          onClick={onOpenFolders}
          aria-label="Manage connected folders"
        >
          <FolderCog size={23} strokeWidth={1.8} />
        </button>
      </header>

      <div className="library-view__search">
        <div className="search-view__input-wrap">
          {/* This icon lives inside the (deliberately unscaled) filter
              input, so it stays at its original size to match — see the
              size-pass notes in app.css for the general rule. */}
          <Search size={17} strokeWidth={2} />
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
            <button
              className="library-view__chip library-view__chip--active"
              onClick={clearAlbumFilter}
            >
              {albumFilter.name}
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
        )}

        {!albumFilter && query.trim() && matches.albums.length > 0 && (
          <div className="library-view__chips scroll-region">
            {matches.albums.map((album) => (
              <button
                key={album.id}
                className="library-view__chip"
                onClick={() => selectAlbum(album)}
              >
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
