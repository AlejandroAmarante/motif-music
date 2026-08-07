// src/views/AlbumView.jsx — NEW
import { useEffect, useState } from "react";
import { Play, Shuffle } from "lucide-react";
import { getAlbum } from "../db/albumsRepo.js";
import { getByAlbumId } from "../db/songsRepo.js";
import { getArtist } from "../db/artistsRepo.js";
import { resolveAlbumMeta } from "../artwork/albumMetaManager.js";
import { formatTotalDuration } from "../utils/formatTime.js";
import { usePlayer } from "../state/PlayerContext.jsx";
import { useNavigation } from "../state/NavigationContext.jsx";
import { Artwork } from "../components/common/Artwork.jsx";
import { SongRow } from "../components/library/SongRow.jsx";
import { PulseMark } from "../components/common/PulseMark.jsx";

function sortTracks(songs) {
  return [...songs].sort((a, b) => {
    const da = a.discNumber || 1;
    const db = b.discNumber || 1;
    if (da !== db) return da - db;
    const ta = a.trackNumber ?? 9999;
    const tb = b.trackNumber ?? 9999;
    if (ta !== tb) return ta - tb;
    return (a.titleLower || "").localeCompare(b.titleLower || "");
  });
}

export function AlbumView({ albumId }) {
  const [album, setAlbum] = useState(null);
  const [artist, setArtist] = useState(null);
  const [songs, setSongs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  const { playSongs, current, isPlaying, toggleShuffle, shuffle } = usePlayer();
  const { openArtist } = useNavigation();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMeta(null);

    getAlbum(albumId).then(async (albumRec) => {
      if (cancelled) return;
      if (!albumRec) {
        setLoading(false);
        return;
      }
      const [songRecs, artistRec] = await Promise.all([
        getByAlbumId(albumId),
        albumRec.artistId
          ? getArtist(albumRec.artistId)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setAlbum(albumRec);
      setArtist(artistRec);
      setSongs(sortTracks(songRecs));
      setLoading(false);

      resolveAlbumMeta({
        id: albumRec.id,
        name: albumRec.name,
        artistName: artistRec?.name || null,
      }).then((result) => {
        if (!cancelled) setMeta(result);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [albumId]);

  const totalDuration = songs.reduce((sum, s) => sum + (s.duration || 0), 0);

  const playFrom = (startIndex = 0) => {
    if (songs.length) playSongs(songs, startIndex);
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

  if (!album) {
    return <p className="search-view__empty">This album could not be found.</p>;
  }

  const artworkSong = {
    id: `album:${album.id}`,
    albumId: album.id,
    artist: artist?.name || album.artistId,
    album: album.name,
    artworkId: album.artworkId,
  };

  const sublineParts = [
    album.year || (meta?.date ? meta.date.slice(0, 4) : null),
    `${songs.length} song${songs.length === 1 ? "" : "s"}`,
    formatTotalDuration(totalDuration),
  ].filter(Boolean);

  return (
    <div className="album-view">
      <div className="album-view__header">
        <Artwork
          song={artworkSong}
          alt={`${album.name} artwork`}
          className="album-view__art"
        />
        <h1 className="album-view__title">{album.name}</h1>
        {artist ? (
          <button
            className="album-view__artist-link"
            onClick={() => openArtist(artist.id)}
          >
            {artist.name}
          </button>
        ) : null}
        <p className="album-view__subline mono">{sublineParts.join(" · ")}</p>
      </div>

      <div className="detail-view__actions">
        <button
          className="detail-view__play-btn"
          onClick={() => playFrom(0)}
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

      <div className="album-view__tracks">
        {songs.map((song, i) => (
          <SongRow
            key={song.id}
            song={song}
            index={i}
            isPlaying={current?.id === song.id}
            activelyPlaying={isPlaying && current?.id === song.id}
            onPlay={playFrom}
          />
        ))}
      </div>
    </div>
  );
}
