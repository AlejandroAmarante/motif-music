import { useRef, useCallback } from 'react';

const SWIPE_THRESHOLD = 45; // px
const TAP_THRESHOLD = 8; // px — below this, treat as a tap, not a swipe

/**
 * Attaches swipe-detection pointer handlers to an element. Reports one of
 * up/down/left/right based on the dominant axis of the gesture, plus live
 * drag delta (for following-the-finger animations like the mini-player
 * sheet), and distinguishes a tap from a swipe so onTap still fires.
 */
export function useSwipe({ onSwipeUp, onSwipeDown, onSwipeLeft, onSwipeRight, onDrag, onDragEnd, onTap }) {
  const start = useRef(null);

  const onPointerDown = useCallback((e) => {
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, []);

  const onPointerMove = useCallback(
    (e) => {
      if (!start.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      onDrag?.({ dx, dy });
    },
    [onDrag]
  );

  const onPointerUp = useCallback(
    (e) => {
      if (!start.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      onDragEnd?.({ dx, dy });

      if (Math.abs(dx) < TAP_THRESHOLD && Math.abs(dy) < TAP_THRESHOLD) {
        onTap?.();
      } else if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > SWIPE_THRESHOLD) onSwipeRight?.();
        else if (dx < -SWIPE_THRESHOLD) onSwipeLeft?.();
      } else {
        if (dy > SWIPE_THRESHOLD) onSwipeDown?.();
        else if (dy < -SWIPE_THRESHOLD) onSwipeUp?.();
      }
      start.current = null;
    },
    [onSwipeUp, onSwipeDown, onSwipeLeft, onSwipeRight, onDragEnd, onTap]
  );

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}
