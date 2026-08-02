import { useEffect, useRef, useState, useCallback } from "react";
import { getSortedIds, getByIds } from "../db/songsRepo.js";

export function useVirtualSongs({
  indexName = "byTitleLower",
  version = 0,
} = {}) {
  const [ids, setIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const cache = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    cache.current = new Map();
    getSortedIds(indexName).then((sortedIds) => {
      if (!cancelled) {
        setIds(sortedIds);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [indexName, version]);

  const isRowLoaded = useCallback(
    (index) => cache.current.has(ids[index]),
    [ids],
  );

  /** Returns true only if it actually fetched something new — lets the caller skip a forced re-render when there's nothing to show that isn't already showing. */
  const loadRange = useCallback(
    async (startIndex, stopIndex) => {
      const windowIds = ids
        .slice(startIndex, stopIndex + 1)
        .filter((id) => !cache.current.has(id));
      if (!windowIds.length) return false;
      const songs = await getByIds(windowIds);
      songs.forEach((song) => cache.current.set(song.id, song));
      return true;
    },
    [ids],
  );

  const getRow = useCallback(
    (index) => cache.current.get(ids[index]) ?? null,
    [ids],
  );

  return { ids, count: ids.length, loading, isRowLoaded, loadRange, getRow };
}
