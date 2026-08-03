import * as Slider from "@radix-ui/react-slider";

/**
 * Thin wrapper around Radix's Slider. Swapped in to replace a bare
 * <input type="range"> whose drag tracking broke once the pointer left the
 * control on mobile/PWA — native range inputs don't guarantee that on all
 * platforms even with manual setPointerCapture() calls layered on top.
 *
 * Radix's Slider owns pointer capture, touch handling, and out-of-bounds
 * dragging internally (it's the same primitive behind most production
 * design systems), so none of that needs to be reimplemented here.
 *
 * `onChange` fires on every tick while dragging — use it to drive the live
 * time display. `onCommit` fires exactly once, on release, and is the only
 * point that should actually seek the audio element.
 */
export function SeekBar({ value, max, onChange, onCommit, disabled = false }) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const safeValue = Math.min(Math.max(value || 0, 0), safeMax);

  return (
    <Slider.Root
      className="seekbar-root"
      min={0}
      max={safeMax}
      step={0.1}
      value={[safeValue]}
      disabled={disabled || safeMax === 0}
      onValueChange={([v]) => onChange?.(v)}
      onValueCommit={([v]) => onCommit?.(v)}
    >
      <Slider.Track className="seekbar-track">
        <Slider.Range className="seekbar-range" />
      </Slider.Track>
      <Slider.Thumb className="seekbar-thumb" aria-label="Seek" />
    </Slider.Root>
  );
}
