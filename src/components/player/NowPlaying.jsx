import { useEffect, useRef, useState } from "react";
import { useSwipeable } from "react-swipeable";
import {
  ChevronDown,
  MicVocal,
  Shuffle,
  SkipBack,
  Play,
  Pause,
  SkipForward,
  Repeat,
  Repeat1,
} from "lucide-react";
import { usePlayer } from "../../state/PlayerContext.jsx";
import { useMountTransition } from "../../utils/useMountTransition.js";
import { useSmoothProgress } from "../../utils/useSmoothProgress.js";
import { Artwork } from "../common/Artwork.jsx";
import { LyricsView } from "./LyricsView.jsx";
import { formatDuration } from "../../utils/formatTime.js";

const isolateDrag = {
  onTouchStart: (e) => e.stopPropagation(),
  onMouseDown: (e) => e.stopPropagation(),
};

export function NowPlaying() {
  const {
    current,
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    playbackRate,
    shuffle,
    repeatMode,
    toggle,
    next,
    previous,
    seek,
    beginScrub,
    endScrub,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    nowPlayingOpen,
    closeNowPlaying,
  } = usePlayer();

  const [dragValue, setDragValue] = useState(null);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const draggingRef = useRef(false);
  const { shouldRender, entered } = useMountTransition(nowPlayingOpen, 320);
  const smoothTime = useSmoothProgress(currentTime, isPlaying, playbackRate);

  useEffect(() => {
    if (dragValue !== null && !draggingRef.current) {
      setDragValue(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime]);

  const swipeHandlers = useSwipeable({
    onSwipedDown: closeNowPlaying,
    onSwipedLeft: next,
    onSwipedRight: previous,
    trackMouse: true,
    preventScrollOnSwipe: true,
    delta: 50,
  });

  if (!shouldRender || !current) return null;

  const displayedTime = dragValue ?? smoothTime;
  const lyricsUnavailable = current.lyrics === false;

  // Pointer capture keeps every subsequent pointermove/pointerup routed to
  // this exact element for the life of the gesture, even once the
  // finger/cursor drifts outside the input's bounding box — without it,
  // a drag that leaves the input area can silently stop being tracked.
  const handleSeekPointerDown = (e) => {
    draggingRef.current = true;
    setDragValue(smoothTime);
    beginScrub();
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture unsupported — drag still works via native range behavior.
    }
  };

  const handleSeekInput = (e) => {
    setDragValue(Number(e.target.value));
  };

  const handleSeekRelease = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    endScrub(Number(e.target.value));
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch {
      // Already released or unsupported — nothing to clean up.
    }
  };

  const handleSeekChange = (e) => {
    if (!draggingRef.current) {
      seek(Number(e.target.value));
    }
  };

  return (
    <div
      className={`now-playing${entered ? " is-open" : ""}`}
      {...swipeHandlers}
    >
      <div className="now-playing__handle-zone">
        <button
          className="now-playing__collapse"
          onClick={closeNowPlaying}
          aria-label="Collapse Now Playing"
        >
          <ChevronDown size={22} strokeWidth={2} />
        </button>
        <span className="now-playing__eyebrow">Playing from Library</span>
        <button
          className="now-playing__collapse"
          onClick={() => setLyricsOpen(true)}
          aria-label={lyricsUnavailable ? "Lyrics unavailable" : "Show lyrics"}
          disabled={lyricsUnavailable}
        >
          <MicVocal size={20} strokeWidth={1.8} />
        </button>
      </div>

      <div className="now-playing__art-wrap">
        <Artwork
          song={current}
          alt={`${current.album || current.title} artwork`}
          className="now-playing__art"
          playing={isPlaying}
        />
      </div>

      <div className="now-playing__meta">
        <h2 className="now-playing__title">{current.title}</h2>
        <p className="now-playing__artist">{current.artist}</p>
      </div>

      <div className="now-playing__seek">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(displayedTime, duration || 0)}
          onPointerDown={handleSeekPointerDown}
          onInput={handleSeekInput}
          onPointerUp={handleSeekRelease}
          onPointerCancel={handleSeekRelease}
          onChange={handleSeekChange}
          {...isolateDrag}
          aria-label="Seek"
        />
        <div className="now-playing__times mono">
          <span>{formatDuration(displayedTime)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      <div className="now-playing__transport">
        <button
          className={`now-playing__ghost-btn${shuffle ? " is-active" : ""}`}
          onClick={toggleShuffle}
          aria-pressed={shuffle}
          aria-label="Shuffle"
        >
          <Shuffle size={20} strokeWidth={1.8} />
        </button>

        <button
          className="now-playing__step-btn"
          onClick={previous}
          aria-label="Previous track"
        >
          <SkipBack size={28} fill="currentColor" />
        </button>

        <button
          className="now-playing__play-btn"
          onClick={toggle}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause size={30} fill="currentColor" />
          ) : (
            <Play size={30} fill="currentColor" />
          )}
        </button>

        <button
          className="now-playing__step-btn"
          onClick={next}
          aria-label="Next track"
        >
          <SkipForward size={28} fill="currentColor" />
        </button>

        <button
          className={`now-playing__ghost-btn${repeatMode !== "off" ? " is-active" : ""}`}
          onClick={cycleRepeat}
          aria-label={`Repeat: ${repeatMode}`}
        >
          {repeatMode === "one" ? (
            <Repeat1 size={20} strokeWidth={1.8} />
          ) : (
            <Repeat size={20} strokeWidth={1.8} />
          )}
        </button>
      </div>

      <div className="now-playing__secondary">
        <input
          className="now-playing__volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          {...isolateDrag}
          aria-label="Volume"
        />
      </div>

      <LyricsView
        isOpen={lyricsOpen}
        onClose={() => setLyricsOpen(false)}
        song={current}
        currentTime={smoothTime}
        onSeekTo={seek}
      />
    </div>
  );
}
