/**
 * Shared "waveform" mark used for loading states, active-tab indicators,
 * and empty states (see .motif-mark in global.css). `active` toggles
 * between the animated (pulse) and fixed-height (static) variant — pass
 * `active={playing}` where the mark should reflect live playback state
 * (see Artwork.jsx), or omit it for an always-animating indicator (setup
 * steps, scan progress, buffering).
 */
export function PulseMark({ active = true, className = "" }) {
  const variant = active ? "pulse" : "static";
  return (
    <span
      className={`motif-mark ${variant}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
