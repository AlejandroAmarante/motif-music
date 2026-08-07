import { useSwipeable } from "react-swipeable";
import { Play, Pause } from "lucide-react";
import { usePlayer } from "../../state/PlayerContext.jsx";
import { useSmoothProgress } from "../../utils/useSmoothProgress.js";
import { Artwork } from "../common/Artwork.jsx";
import { PulseMark } from "../common/PulseMark.jsx";

export function MiniPlayer() {
  const {
    current,
    isPlaying,
    buffering,
    currentTime,
    duration,
    playbackRate,
    toggle,
    next,
    previous,
    openNowPlaying,
  } = usePlayer();

  const swipeHandlers = useSwipeable({
    onSwipedUp: openNowPlaying,
    onSwipedLeft: next,
    onSwipedRight: previous,
    trackMouse: true,
    preventScrollOnSwipe: true,
    delta: 40,
  });

  const smoothTime = useSmoothProgress(currentTime, isPlaying, playbackRate);

  if (!current) return null;

  const progress = duration > 0 ? Math.min(1, smoothTime / duration) : 0;

  return (
    <div
      className="mini-player"
      role="button"
      tabIndex={0}
      aria-label={`Now playing: ${current.title}. Tap to expand.`}
      onClick={openNowPlaying}
      {...swipeHandlers}
    >
      <div
        className="mini-player__progress"
        style={{ transform: `scaleX(${progress})` }}
      />
      <Artwork
        song={current}
        alt=""
        className="mini-player__art"
        playing={isPlaying}
      />
      <div className="mini-player__text">
        <p className="mini-player__title">{current.title}</p>
        <p className="mini-player__artist">{current.artist}</p>
      </div>
      <button
        className="mini-player__play"
        aria-label={isPlaying ? "Pause" : "Play"}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        {buffering ? (
          <PulseMark />
        ) : isPlaying ? (
          <Pause size={26} fill="currentColor" />
        ) : (
          <Play size={26} fill="currentColor" />
        )}
      </button>
    </div>
  );
}
