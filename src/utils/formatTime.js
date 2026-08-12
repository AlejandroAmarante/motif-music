// src/utils/formatTime.js — added formatEta, formatTotalDuration and formatDuration unchanged
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** "3 hr 42 min" / "42 min" — for artist/album total-duration stats, where mm:ss reads wrong past an hour. */
export function formatTotalDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 min";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} hr ${minutes} min`;
  return `${minutes} min`;
}

/** "~38s remaining" / "~4 min remaining" — for scan progress, where the estimate only needs to communicate direction and rough scale, not precision. Returns null when there's nothing meaningful to show yet. */
export function formatEta(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 8) return "Almost done";
  if (totalSeconds < 60) return `~${totalSeconds}s remaining`;
  const totalMinutes = Math.round(totalSeconds / 60);
  return `~${totalMinutes} min remaining`;
}
