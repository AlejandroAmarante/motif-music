// src/views/ArtistView.jsx — NEW
import { useEffect, useState } from "react";
import {
  ListMusic,
  Disc3,
  TrendingUp,
  Clock,
  Play,
  Shuffle,
} from "lucide-react";
import { getArtist } from "../db/artistsRepo.js";
import { getByArtistId } from "../db/songsRepo.js";
import { getAlbumsByArtistId } from "../db/albumsRepo.js";
import { resolveArtistMeta } from "../artwork/artistMetaManager.js";
import { useArtworkUrl } from "../utils/useArtworkUrl.js";
import { formatTotalDuration } from "../utils/formatTime.js";
import { usePlayer } from "../state/PlayerContext.jsx";
import { useNavigation } from "../state/NavigationContext.jsx";
import { Artwork } from "../components/common/Artwork.jsx";
import { PulseMark } from "../components/common/PulseMark.jsx";

export function ArtistView({ artistId }) {
  const [artist, setArtist] = useState(null);
  const [songs, setSongs] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  const { playSongs, toggleShuffle, shuffle } = usePlayer();
  const { openAlbum } = useNavigation();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMeta(null);

    Promise.all([
      getArtist(artistId),
      getByArtistId(artistId),
      getAlbumsByArtistId(artistId),
    ]).then(([artistRec, songRecs, albumRecs]) => {
      if (cancelled) return;
      setArtist(artistRec);
      setSongs(songRecs);
      setAlbums([...albumRecs].sort((a, b) => (b.year || 0) - (a.year || 0)));
      setLoading(false);

      if (artistRec) {
        resolveArtistMeta(artistRec).then((result) => {
          if (!cancelled) setMeta(result);
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [artistId]);

  const heroLocalUrl = useArtworkUrl(
    !meta?.imageUrl ? (meta?.fallbackArtworkId ?? null) : null,
  );
  const heroUrl = meta?.imageUrl || heroLocalUrl || null;

  const totalDuration = songs.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalPlays = songs.reduce((sum, s) => sum + (s.playCount || 0), 0);

  const handlePlayAll = () => {
    if (songs.length) playSongs(songs, 0);
  };

  const handleShufflePlay = () => {
    if (!songs.length) return;
    playSongs(songs, Math.floor(Math.random() * songs.length));
    if (!shuffle) toggleShuffle();
  };

  if (loading) {
    return (
      <div className="detail-view__loading">
        <PulseMark />
      </div>
    );
  }

  if (!artist) {
    return (
      <p className="search-view__empty">This artist could not be found.</p>
    );
  }

  return (
    <div className="artist-view">
      <div
        className="artist-view__hero"
        style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined}
      >
        <div className="artist-view__hero-scrim" aria-hidden="true" />
        <h1 className="artist-view__name">{artist.name}</h1>
      </div>

      {meta?.tags?.length > 0 && (
        <div className="artist-view__tags">
          {meta.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="artist-view__tag">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="detail-view__stats">
        <div className="detail-view__stat">
          <ListMusic size={17} strokeWidth={1.8} />
          <span className="mono">{songs.length}</span>
          <span>songs</span>
        </div>
        <div className="detail-view__stat">
          <Disc3 size={17} strokeWidth={1.8} />
          <span className="mono">{albums.length}</span>
          <span>albums</span>
        </div>
        <div className="detail-view__stat">
          <TrendingUp size={17} strokeWidth={1.8} />
          <span className="mono">{totalPlays}</span>
          <span>plays</span>
        </div>
        <div className="detail-view__stat">
          <Clock size={17} strokeWidth={1.8} />
          <span className="mono">{formatTotalDuration(totalDuration)}</span>
        </div>
      </div>

      <div className="detail-view__actions">
        <button
          className="detail-view__play-btn"
          onClick={handlePlayAll}
          disabled={!songs.length}
        >
          <Play size={17} fill="currentColor" /> Play
        </button>
        <button
          className="detail-view__shuffle-btn"
          onClick={handleShufflePlay}
          disabled={!songs.length}
        >
          <Shuffle size={17} strokeWidth={2} /> Shuffle
        </button>
      </div>

      <h2 className="home-rail__title">Discography</h2>
      {albums.length ? (
        <div className="artist-view__albums-grid">
          {albums.map((album) => (
            <button
              key={album.id}
              className="artist-view__album-card"
              onClick={() => openAlbum(album.id)}
            >
              <Artwork
                song={{
                  id: `album:${album.id}`,
                  albumId: album.id,
                  artist: artist.name,
                  album: album.name,
                  artworkId: album.artworkId,
                }}
                alt=""
                className="artist-view__album-art"
              />
              <p className="artist-view__album-name">{album.name}</p>
              {album.year ? (
                <p className="artist-view__album-year mono">{album.year}</p>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="search-view__empty">No albums found for this artist.</p>
      )}
    </div>
  );
}
