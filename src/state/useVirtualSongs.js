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
  // Bumped every time loadRange actually adds something to the cache.
  // This is the real fix for songs getting stuck on skeleton rows: react-
  // window's <List> only re-renders a given row when something inside its
  // `rowProps` object actually changes (it shallow-compares them) — it has
  // no way to know that `cache` (a plain ref) was mutated behind the
  // scenes. `getRow` below depends on this counter specifically so its
  // *function identity* changes whenever new data lands, which is what
  // actually tells List "these rows need to re-render." Depending on
  // `ids` alone (the previous approach) meant getRow's identity was stable
  // across a cache-only update, so already-mounted rows silently kept
  // showing their initial (skeleton) render forever, even though the data
  // they needed was sitting in the cache the whole time.
  const [cacheTick, setCacheTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    cache.current = new Map();
    setCacheTick(0);
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

  /** Returns true only if it actually fetched something new. */
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
      setCacheTick((t) => t + 1);
      return true;
    },
    [ids],
  );

  const getRow = useCallback(
    (index) => cache.current.get(ids[index]) ?? null,
    [ids, cacheTick],
  );

  // Root-cause fix for songs never appearing until a filter is applied:
  // the list's onRowsRendered callback isn't guaranteed to fire before the
  // first paint (and filtering bypasses this loader entirely by rendering
  // already-hydrated search results directly, which is why filtering
  // "worked"). Loading the first window as soon as ids are known removes
  // that dependency — rows show up immediately, and onRowsRendered still
  // takes over for everything scrolled into view afterward. No separate
  // "did I just load something" bookkeeping is needed here anymore —
  // loadRange itself bumps cacheTick (and therefore triggers a re-render)
  // whenever it actually loads something.
  useEffect(() => {
    if (!ids.length) return;
    loadRange(0, Math.min(ids.length - 1, INITIAL_LOAD_COUNT - 1));
  }, [ids, loadRange]);

  return { ids, count: ids.length, loading, isRowLoaded, loadRange, getRow };
}
