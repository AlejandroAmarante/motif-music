import { getAllLite } from '../db/songsRepo.js';
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

  return {
    songs: scoreGroup(songs, (s) => `${s.titleLower} ${normalize(s.artist)} ${normalize(s.album)}`),
    artists: scoreGroup(artists, (a) => a.nameLower),
    albums: scoreGroup(albums, (a) => a.nameLower)
  };
}
