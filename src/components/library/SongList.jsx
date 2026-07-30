import { useCallback, useRef, useState, useEffect } from 'react';
import { FixedSizeList } from 'react-window';
import { useVirtualSongs } from '../../state/useVirtualSongs.js';
import { getByIds } from '../../db/songsRepo.js';
import { usePlayer } from '../../state/PlayerContext.jsx';
import { SongRow } from './SongRow.jsx';

const ROW_HEIGHT = 60;
const PLAY_WINDOW = 300; // how many upcoming tracks we materialize into the queue on tap

export function SongList({ version = 0, sortIndex = 'byTitleLower', emptyState }) {
  const { ids, count, loading, loadRange, getRow } = useVirtualSongs({ indexName: sortIndex, version });
  const { playSongs, current } = usePlayer();
  const [, forceTick] = useState(0);
  const containerRef = useRef(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setHeight(entries[0].contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleItemsRendered = useCallback(
    ({ overscanStartIndex, overscanStopIndex }) => {
      loadRange(overscanStartIndex, overscanStopIndex).then(() => forceTick((t) => t + 1));
    },
    [loadRange]
  );

  const handlePlay = useCallback(
    async (index) => {
      const windowIds = ids.slice(index, index + PLAY_WINDOW);
      const songs = await getByIds(windowIds);
      // getByIds doesn't preserve order (parallel gets) — restore it to match the list.
      const byId = new Map(songs.map((s) => [s.id, s]));
      const ordered = windowIds.map((id) => byId.get(id)).filter(Boolean);
      playSongs(ordered, 0);
    },
    [ids, playSongs]
  );

  if (!loading && count === 0) {
    return <div className="song-list__empty">{emptyState}</div>;
  }

  return (
    <div className="song-list" ref={containerRef}>
      {!loading && (
        <FixedSizeList
          height={height}
          width="100%"
          itemCount={count}
          itemSize={ROW_HEIGHT}
          overscanCount={12}
          onItemsRendered={handleItemsRendered}
        >
          {({ index, style }) => (
            <SongRow
              style={style}
              song={getRow(index)}
              isPlaying={current?.id === getRow(index)?.id}
              onPlay={() => handlePlay(index)}
            />
          )}
        </FixedSizeList>
      )}
    </div>
  );
}
