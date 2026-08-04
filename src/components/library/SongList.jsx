import { useCallback, useRef, useState, useEffect } from "react";
import { List } from "react-window";
import { useVirtualSongs } from "../../state/useVirtualSongs.js";
import { getByIds } from "../../db/songsRepo.js";
import { usePlayer } from "../../state/PlayerContext.jsx";
import { SongRow } from "./SongRow.jsx";

const ROW_HEIGHT = 68;
const PLAY_WINDOW = 300;

function Row({ index, style, getRowAt, current, isPlaying, onPlay }) {
  const song = getRowAt(index);
  return (
    <SongRow
      style={style}
      song={song}
      index={index}
      isPlaying={current?.id === song?.id}
      activelyPlaying={isPlaying && current?.id === song?.id}
      onPlay={onPlay}
    />
  );
}

/** Pulls a {startIndex, stopIndex} range out of whatever shape onRowsRendered was called with. */
function normalizeRange(a, b) {
  if (b && typeof b.startIndex === "number") return b;
  if (a && typeof a.startIndex === "number") return a;
  if (typeof a === "number") return { startIndex: a, stopIndex: typeof b === "number" ? b : a };
  return null;
}

export function SongList({
  version = 0,
  sortIndex = "byTitleLower",
  emptyState,
  overrideSongs = null,
}) {
  // getRow's own identity changes whenever useVirtualSongs' cache is
  // actually mutated (see useVirtualSongs.js) — that's what lets
  // react-window's <List> know a given row needs to re-render, since it
  // shallow-compares `rowProps` rather than watching our cache ref. No
  // extra "did something load" bookkeeping is needed here anymore.
  const { ids, count, loading, loadRange, getRow } = useVirtualSongs({
    indexName: sortIndex,
    version,
  });
  const { playSongs, current, isPlaying } = usePlayer();
  const containerRef = useRef(null);
  const [height, setHeight] = useState(400);

  const filtering = overrideSongs != null;
  const effectiveCount = filtering ? overrideSongs.length : count;
  const effectiveLoading = filtering ? false : loading;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) =>
      setHeight(entries[0].contentRect.height),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleRowsRendered = useCallback(
    (a, b) => {
      if (filtering) return;
      // Different releases of the underlying list library have shipped
      // onRowsRendered with different call shapes (two range objects, one
      // range object, or plain indices). Normalizing here means a library
      // version bump can't silently stop rows from loading again — see
      // useVirtualSongs.js for the matching eager-load fix for first paint.
      const range = normalizeRange(a, b);
      if (!range) return;
      loadRange(range.startIndex, range.stopIndex);
    },
    [loadRange, filtering],
  );

  const getRowAt = useCallback(
    (index) => (filtering ? overrideSongs[index] : getRow(index)),
    [filtering, overrideSongs, getRow],
  );

  const handlePlay = useCallback(
    async (index) => {
      if (filtering) {
        playSongs(overrideSongs.slice(index), 0);
        return;
      }
      const windowIds = ids.slice(index, index + PLAY_WINDOW);
      const songs = await getByIds(windowIds);
      const byId = new Map(songs.map((s) => [s.id, s]));
      const ordered = windowIds.map((id) => byId.get(id)).filter(Boolean);
      playSongs(ordered, 0);
    },
    [filtering, overrideSongs, ids, playSongs],
  );

  if (!effectiveLoading && effectiveCount === 0) {
    return <div className="song-list__empty">{emptyState}</div>;
  }

  return (
    <div className="song-list" ref={containerRef}>
      {!effectiveLoading && (
        <List
          rowComponent={Row}
          rowCount={effectiveCount}
          rowHeight={ROW_HEIGHT}
          rowProps={{ getRowAt, current, isPlaying, onPlay: handlePlay }}
          onRowsRendered={handleRowsRendered}
          style={{ height, width: "100%" }}
        />
      )}
    </div>
  );
}
