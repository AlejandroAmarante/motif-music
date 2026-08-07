import { useEffect, useRef, useState } from "react";
import { search } from "../search/searchIndex.js";

const EMPTY_RESULTS = { songs: [], artists: [], albums: [] };
const DEFAULT_DELAY_MS = 120;

/**
 * Debounces `query` and re-runs the fuzzy search index once it (or
 * `version`, bumped on any library change) settles, clearing results
 * immediately for a blank query. LibraryView and SearchView each had
 * their own copy of this exact debounce/clear/cleanup logic — the only
 * real difference was which fields of the result each one read, which
 * doesn't need two implementations. Callers that only care about a
 * subset (LibraryView never reads `.artists`) can just ignore the rest.
 */
export function useDebouncedSearch(
  query,
  version,
  { delay = DEFAULT_DELAY_MS } = {},
) {
  const [results, setResults] = useState(EMPTY_RESULTS);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults(EMPTY_RESULTS);
      return undefined;
    }
    debounceRef.current = setTimeout(() => {
      search(query, version).then(setResults);
    }, delay);
    return () => clearTimeout(debounceRef.current);
  }, [query, version, delay]);

  return results;
}
