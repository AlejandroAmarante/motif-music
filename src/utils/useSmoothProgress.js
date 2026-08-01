import { useEffect, useRef, useState } from 'react';

/**
 * The audio element's `timeupdate` event fires irregularly — sometimes
 * only a handful of times per second — which makes a progress bar driven
 * directly off it look stepped rather than fluid. This interpolates
 * between ticks by advancing with real wall-clock time while playing, and
 * resyncs to the authoritative value every time a fresh tick arrives.
 */
export function useSmoothProgress(currentTime, isPlaying, playbackRate = 1) {
  const [display, setDisplay] = useState(currentTime);
  const rafRef = useRef(null);
  const anchorRef = useRef({ time: currentTime, wall: performance.now() });

  useEffect(() => {
    anchorRef.current = { time: currentTime, wall: performance.now() };
    setDisplay(currentTime);
  }, [currentTime]);

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return undefined;
    }
    const tick = () => {
      const elapsed = (performance.now() - anchorRef.current.wall) / 1000;
      setDisplay(anchorRef.current.time + elapsed * playbackRate);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, playbackRate]);

  return display;
}
