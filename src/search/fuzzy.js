/**
 * Scores how well `query` matches `text` (both expected lowercase already).
 * Returns null for no match. Higher is better.
 *   - exact prefix match scores highest
 *   - substring match scores well
 *   - in-order subsequence match ("fuzzy") scores lowest but still counts,
 *     so "ptrsn" can still find "porter robinson"
 */
export function fuzzyScore(text, query) {
  if (!text || !query) return null;
  if (text === query) return 120;
  if (text.startsWith(query)) return 100 - (text.length - query.length) * 0.1;
  if (text.includes(query)) return 70 - (text.length - query.length) * 0.05;

  // Subsequence match: every char of query appears in order in text.
  let ti = 0;
  let gaps = 0;
  for (let qi = 0; qi < query.length; qi += 1) {
    const idx = text.indexOf(query[qi], ti);
    if (idx === -1) return null;
    gaps += idx - ti;
    ti = idx + 1;
  }
  return Math.max(1, 30 - gaps);
}
