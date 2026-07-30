import { useEffect, useRef, useState, useCallback } from 'react';
import { getSortedIds, getByIds } from '../db/songsRepo.js';

/**
 * Backs a react-window list over a potentially huge song table without
 * loading every record into memory: only sorted primary keys are held in
 * JS (cheap even at 250k+ songs), and full records are fetched in small
 * batches as rows scroll into view.
 */
export function useVirtualSongs({ indexName = 'byTitleLower', version = 0 } = {}) {
  const [ids, setIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const cache = useRef(new Map()); // id -> song record

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

  const isRowLoaded = useCallback((index) => cache.current.has(ids[index]), [ids]);

  const loadRange = useCallback(
    async (startIndex, stopIndex) => {
      const windowIds = ids.slice(startIndex, stopIndex + 1).filter((id) => !cache.current.has(id));
      if (!windowIds.length) return;
      const songs = await getByIds(windowIds);
      songs.forEach((song) => cache.current.set(song.id, song));
    },
    [ids]
  );

  const getRow = useCallback((index) => cache.current.get(ids[index]) ?? null, [ids]);

  return { ids, count: ids.length, loading, isRowLoaded, loadRange, getRow };
}
