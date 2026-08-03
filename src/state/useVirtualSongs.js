import { useEffect, useRef, useState, useCallback } from "react";
import { getSortedIds, getByIds } from "../db/songsRepo.js";

// Enough rows to cover the first screenful plus overscan on any device,
// loaded eagerly the moment ids resolve rather than waiting on a
// scroll/resize-driven callback that may not fire before first paint.
const INITIAL_LOAD_COUNT = 60;

export function useVirtualSongs({
  indexName = "byTitleLower",
  version = 0,
} = {}) {
  const [ids, setIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const cache = useRef(new Map());
  const [, forceRerender] = useState(0);

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
      if (!Number.isFinite(startIndex) || !Number.isFinite(stopIndex)) return false;
      const from = Math.max(0, Math.min(startIndex, stopIndex));
      const to = Math.max(startIndex, stopIndex);
      const windowIds = ids
        .slice(from, to + 1)
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

  // Root-cause fix for songs never appearing until a filter is applied:
  // the list's onRowsRendered callback isn't guaranteed to fire before the
  // first paint (and filtering bypasses this loader entirely by rendering
  // already-hydrated search results directly, which is why filtering
  // "worked"). Loading the first window as soon as ids are known removes
  // that dependency — rows show up immediately, and onRowsRendered still
  // takes over for everything scrolled into view afterward.
  useEffect(() => {
    if (!ids.length) return undefined;
    let cancelled = false;
    loadRange(0, Math.min(ids.length - 1, INITIAL_LOAD_COUNT - 1)).then(
      (loaded) => {
        if (loaded && !cancelled) forceRerender((t) => t + 1);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return { ids, count: ids.length, loading, isRowLoaded, loadRange, getRow };
}
