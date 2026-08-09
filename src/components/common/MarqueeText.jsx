// src/components/common/MarqueeText.jsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export default function MarqueeText({
  children,
  className = "",
  speed = 12,
  delay = 1.4,
  gap = "4.5rem",
}) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const timerRef = useRef(null);

  const [overflowing, setOverflowing] = useState(false);
  const [running, setRunning] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;

    if (!container || !measure) return;

    let rafId = 0;

    const checkOverflow = () => {
      const availableWidth = container.clientWidth;
      const contentWidth = measure.scrollWidth;

      setOverflowing(contentWidth > availableWidth + 1);
    };

    const scheduleCheck = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(checkOverflow);
    };

    scheduleCheck();

    const observer = new ResizeObserver(scheduleCheck);
    observer.observe(container);
    observer.observe(measure);

    window.addEventListener("resize", scheduleCheck);
    document.fonts?.ready?.then(scheduleCheck).catch(() => {});

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("resize", scheduleCheck);
    };
  }, [children]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setRunning(false);

    if (!overflowing) return;

    timerRef.current = setTimeout(
      () => {
        setRunning(true);
      },
      Math.max(0, delay * 1000),
    );

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [children, overflowing, delay]);

  const handleIteration = () => {
    if (!overflowing) return;

    setRunning(false);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(
      () => {
        setRunning(true);
      },
      Math.max(0, delay * 1000),
    );
  };

  const active = overflowing && running;

  return (
    <span
      ref={containerRef}
      className={`marquee${className ? ` ${className}` : ""}`}
      data-overflow={overflowing ? "true" : "false"}
      data-running={active ? "true" : "false"}
      style={{
        "--marquee-duration": `${speed}s`,
        "--marquee-gap": gap,
        "--marquee-delay": `${delay}s`,
      }}
    >
      {/* Invisible measurement copy. This is NEVER duplicated. */}
      <span ref={measureRef} className="marquee__measure" aria-hidden="true">
        {children}
      </span>

      <span
        className={`marquee__track${active ? " is-running" : ""}`}
        onAnimationIteration={handleIteration}
      >
        <span className="marquee__content">{children}</span>

        <span className="marquee__gap" aria-hidden="true" />

        {active && (
          <span className="marquee__content" aria-hidden="true">
            {children}
          </span>
        )}
      </span>

      {active && <span className="marquee__left-fade" aria-hidden="true" />}

      {overflowing && (
        <span className="marquee__right-fade" aria-hidden="true" />
      )}
    </span>
  );
}
