// src/components/player/NowPlaying.jsx — full updated file
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
import { useNavigation } from "../../state/NavigationContext.jsx";
import { resolveArtistNavigation } from "../../library/navigation.js";
import { useMountTransition } from "../../utils/useMountTransition.js";
import { useSmoothProgress } from "../../utils/useSmoothProgress.js";
import { Artwork } from "../common/Artwork.jsx";
import { LyricsView } from "./LyricsView.jsx";
import { SeekBar } from "./SeekBar.jsx";
import { ArtistNavigationSheet } from "./ArtistNavigationSheet.jsx";
import { formatDuration } from "../../utils/formatTime.js";
import MarqueeText from "../common/MarqueeText.jsx";

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

  const { openArtist, openAlbum } = useNavigation();

  const [dragValue, setDragValue] = useState(null);
  const [lyricsOpen, setLyricsOpen] = useState(false);

  // { artistId, albumId } while the "View Artist / View Album" chooser is
  // showing; null otherwise.
  const [artistNavChoice, setArtistNavChoice] = useState(null);

  const draggingRef = useRef(false);

  // Prevent seek gestures from being interpreted as swipe navigation.
  const seekingRef = useRef(false);

  const { shouldRender, entered } = useMountTransition(nowPlayingOpen, 320);
  const smoothTime = useSmoothProgress(currentTime, isPlaying, playbackRate);

  useEffect(() => {
    if (dragValue !== null && !draggingRef.current) {
      setDragValue(null);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime]);

  const swipeHandlers = useSwipeable({
    onSwipedDown: () => {
      if (!seekingRef.current) closeNowPlaying();
    },
    onSwipedLeft: () => {
      if (!seekingRef.current) next();
    },
    onSwipedRight: () => {
      if (!seekingRef.current) previous();
    },
    trackMouse: true,
    preventScrollOnSwipe: true,
    delta: 50,
  });

  const resetSeekGuard = () => {
    seekingRef.current = false;
  };

  const handleArtistTap = async () => {
    if (!current) return;

    const result = await resolveArtistNavigation(current);

    if (!result) return;

    if (result.type === "choice") {
      setArtistNavChoice(result);
    } else {
      closeNowPlaying();
      openArtist(result.artistId);
    }
  };

  if (!shouldRender || !current) return null;

  const displayedTime = dragValue ?? smoothTime;
  const lyricsUnavailable = current.lyrics === false;

  // The first onChange tick starts scrubbing and pauses playback.
  // onCommit is the only point that actually seeks.
  const handleSeekChange = (v) => {
    if (!draggingRef.current) {
      draggingRef.current = true;
      seekingRef.current = true;
      beginScrub();
    }

    setDragValue(v);
  };

  const handleSeekCommit = (v) => {
    draggingRef.current = false;
    setDragValue(v);
    endScrub(v);
  };

  // Safety net if pointer capture/release is lost.
  const handleSeekBlur = () => {
    if (draggingRef.current) {
      handleSeekCommit(dragValue ?? smoothTime);
    }
  };

  return (
    <div
      className={`now-playing${entered ? " is-open" : ""}`}
      {...swipeHandlers}
      onTouchStartCapture={resetSeekGuard}
      onPointerDownCapture={resetSeekGuard}
    >
      <div className="now-playing__handle-zone">
        <button
          className="now-playing__collapse"
          onClick={closeNowPlaying}
          aria-label="Collapse Now Playing"
        >
          <ChevronDown size={25} strokeWidth={2} />
        </button>
        <span className="now-playing__eyebrow">Playing from Library</span>
        <button
          className="now-playing__collapse"
          onClick={() => setLyricsOpen(true)}
          aria-label={lyricsUnavailable ? "Lyrics unavailable" : "Show lyrics"}
          disabled={lyricsUnavailable}
        >
          <MicVocal size={23} strokeWidth={1.8} />
        </button>
      </div>

      <div className="now-playing__flex-spacer" aria-hidden="true" />

      <div className="now-playing__art-wrap">
        <Artwork
          song={current}
          alt={`${current.album || current.title} artwork`}
          className="now-playing__art"
          playing={isPlaying}
        />
      </div>

      <div className="now-playing__meta">
        <MarqueeText className="now-playing__title" speed={12} delay={1.2}>
          {current.title}
        </MarqueeText>

        <button
          className="now-playing__artist-btn"
          onClick={handleArtistTap}
          aria-label={current.artist}
          title={current.artist}
        >
          <MarqueeText className="now-playing__artist" speed={14} delay={1.4}>
            {current.artist}
          </MarqueeText>
        </button>
      </div>

      <div
        className="now-playing__seek"
        {...isolateDrag}
        onBlur={handleSeekBlur}
      >
        <SeekBar
          value={displayedTime}
          max={duration || 0}
          onChange={handleSeekChange}
          onCommit={handleSeekCommit}
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
          <Shuffle size={23} strokeWidth={1.8} />
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
          className={`now-playing__ghost-btn${
            repeatMode !== "off" ? " is-active" : ""
          }`}
          onClick={cycleRepeat}
          aria-label={`Repeat: ${repeatMode}`}
        >
          {repeatMode === "one" ? (
            <Repeat1 size={23} strokeWidth={1.8} />
          ) : (
            <Repeat size={23} strokeWidth={1.8} />
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

      <div className="now-playing__flex-spacer" aria-hidden="true" />

      <LyricsView
        isOpen={lyricsOpen}
        onClose={() => setLyricsOpen(false)}
        song={current}
        currentTime={smoothTime}
        onSeekTo={seek}
      />

      <ArtistNavigationSheet
        isOpen={artistNavChoice != null}
        artistName={current.artist}
        onClose={() => setArtistNavChoice(null)}
        onViewArtist={() => {
          const { artistId } = artistNavChoice;

          setArtistNavChoice(null);
          closeNowPlaying();
          openArtist(artistId);
        }}
        onViewAlbum={() => {
          const { albumId } = artistNavChoice;

          setArtistNavChoice(null);
          closeNowPlaying();
          openAlbum(albumId);
        }}
      />
    </div>
  );
}
