import { getAllLite, getByIds } from '../db/songsRepo.js';
import { getAllArtists } from '../db/artistsRepo.js';
import { getAllAlbums } from '../db/albumsRepo.js';
import { fuzzyScore } from './fuzzy.js';
import { normalize } from '../utils/id.js';

let cache = { version: -1, songs: [], artists: [], albums: [] };

async function ensureIndex(version) {
  if (cache.version === version) return cache;
  const [songs, artists, albums] = await Promise.all([getAllLite(), getAllArtists(), getAllAlbums()]);
  cache = { version, songs, artists, albums };
  return cache;
}

const MAX_RESULTS_PER_GROUP = 25;

export async function search(query, version) {
  const q = normalize(query);
  if (!q) return { songs: [], artists: [], albums: [] };

  const { songs, artists, albums } = await ensureIndex(version);

  const scoreGroup = (rows, textFn) =>
    rows
      .map((row) => ({ row, score: fuzzyScore(textFn(row), q) }))
      .filter((r) => r.score != null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS_PER_GROUP)
      .map((r) => r.row);

  const songMatches = scoreGroup(songs, (s) => `${s.titleLower} ${normalize(s.artist)} ${normalize(s.album)}`);
  // The in-memory index only holds lite rows (id/title/artist/album) to stay
  // cheap at 250k songs — hydrate just the capped result set into full
  // records so artwork, duration, and favorite state render correctly.
  const hydratedSongs = await getByIds(songMatches.map((s) => s.id));
  const byId = new Map(hydratedSongs.map((s) => [s.id, s]));
  const orderedSongs = songMatches.map((s) => byId.get(s.id)).filter(Boolean);

  return {
    songs: orderedSongs,
    artists: scoreGroup(artists, (a) => a.nameLower),
    albums: scoreGroup(albums, (a) => a.nameLower)
  };
}
