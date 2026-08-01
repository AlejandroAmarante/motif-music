import { useEffect, useState } from 'react';

/**
 * Keeps a component mounted through its exit animation instead of vanishing
 * instantly. Returns `shouldRender` (keep it in the DOM) and `entered`
 * (apply the "settled" state — flip a CSS class on this to animate in/out).
 *
 * Usage:
 *   const { shouldRender, entered } = useMountTransition(isOpen, 280);
 *   if (!shouldRender) return null;
 *   <div className={`sheet ${entered ? 'is-open' : ''}`}>...
 */
export function useMountTransition(isOpen, duration = 260) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    let hideTimer;
    let raf1;
    let raf2;

    if (isOpen) {
      setShouldRender(true);
      // Double rAF: mount in the "closed" position first, then flip to
      // "open" on the next frame so the browser actually animates the
      // transition instead of skipping straight to the end state.
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setEntered(true));
      });
    } else {
      setEntered(false);
      hideTimer = setTimeout(() => setShouldRender(false), duration);
    }

    return () => {
      clearTimeout(hideTimer);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [isOpen, duration]);

  return { shouldRender, entered };
}
