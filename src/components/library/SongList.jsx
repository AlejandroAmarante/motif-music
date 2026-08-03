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

export function SongList({
  version = 0,
  sortIndex = "byTitleLower",
  emptyState,
  overrideSongs = null,
}) {
  const { ids, count, loading, loadRange, getRow } = useVirtualSongs({
    indexName: sortIndex,
    version,
  });
  const { playSongs, current, isPlaying } = usePlayer();
  const [, forceTick] = useState(0);
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
    (_visibleRows, allRows) => {
      if (filtering) return;
      loadRange(allRows.startIndex, allRows.stopIndex).then((loaded) => {
        if (loaded) forceTick((t) => t + 1);
      });
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
