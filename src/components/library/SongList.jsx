import { useCallback, useRef, useState, useEffect } from 'react';
import { FixedSizeList } from 'react-window';
import { useVirtualSongs } from '../../state/useVirtualSongs.js';
import { getByIds } from '../../db/songsRepo.js';
import { usePlayer } from '../../state/PlayerContext.jsx';
import { SongRow } from './SongRow.jsx';

const ROW_HEIGHT = 68;
const PLAY_WINDOW = 300; // how many upcoming tracks we materialize into the queue on tap

/**
 * Two modes, one component:
 *  - default: virtualized over the full library via sorted IndexedDB keys
 *  - `overrideSongs`: a small, already-resolved array (e.g. search-filtered
 *    results) — skips the windowed-fetch machinery since everything's
 *    already in memory and the result set is capped anyway.
 */
export function SongList({ version = 0, sortIndex = 'byTitleLower', emptyState, overrideSongs = null }) {
  const { ids, count, loading, loadRange, getRow } = useVirtualSongs({ indexName: sortIndex, version });
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
    const observer = new ResizeObserver((entries) => setHeight(entries[0].contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleItemsRendered = useCallback(
    ({ overscanStartIndex, overscanStopIndex }) => {
      if (filtering) return;
      loadRange(overscanStartIndex, overscanStopIndex).then(() => forceTick((t) => t + 1));
    },
    [loadRange, filtering]
  );

  const getRowAt = useCallback((index) => (filtering ? overrideSongs[index] : getRow(index)), [filtering, overrideSongs, getRow]);

  const handlePlay = useCallback(
    async (index) => {
      if (filtering) {
        playSongs(overrideSongs.slice(index), 0);
        return;
      }
      const windowIds = ids.slice(index, index + PLAY_WINDOW);
      const songs = await getByIds(windowIds);
      // getByIds doesn't preserve order (parallel gets) — restore it to match the list.
      const byId = new Map(songs.map((s) => [s.id, s]));
      const ordered = windowIds.map((id) => byId.get(id)).filter(Boolean);
      playSongs(ordered, 0);
    },
    [filtering, overrideSongs, ids, playSongs]
  );

  if (!effectiveLoading && effectiveCount === 0) {
    return <div className="song-list__empty">{emptyState}</div>;
  }

  return (
    <div className="song-list" ref={containerRef}>
      {!effectiveLoading && (
        <FixedSizeList
          height={height}
          width="100%"
          itemCount={effectiveCount}
          itemSize={ROW_HEIGHT}
          overscanCount={12}
          onItemsRendered={handleItemsRendered}
        >
          {({ index, style }) => (
            <SongRow
              style={style}
              song={getRowAt(index)}
              isPlaying={current?.id === getRowAt(index)?.id}
              activelyPlaying={isPlaying && current?.id === getRowAt(index)?.id}
              onPlay={() => handlePlay(index)}
            />
          )}
        </FixedSizeList>
      )}
    </div>
  );
}
