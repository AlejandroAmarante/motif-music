// src/state/NavigationContext.jsx — NEW
import { createContext, useContext, useState, useCallback } from "react";

const NavigationContext = createContext(null);

/**
 * A tiny navigation stack for the Artist/Album detail overlays. Motif has
 * no router — every other screen is plain tab or overlay state — so this
 * follows the same pattern rather than introducing routing for two screens.
 * Stack (not a single "open id") because Artist → Album → (back) → Artist
 * needs to return to the artist page, not close entirely.
 */
export function NavigationProvider({ children }) {
  const [stack, setStack] = useState([]); // [{ type: 'artist'|'album', id }]

  const openArtist = useCallback((id) => {
    if (!id) return;
    setStack((prev) => [...prev, { type: "artist", id }]);
  }, []);

  const openAlbum = useCallback((id) => {
    if (!id) return;
    setStack((prev) => [...prev, { type: "album", id }]);
  }, []);

  const goBack = useCallback(() => {
    setStack((prev) => prev.slice(0, -1));
  }, []);

  const closeAll = useCallback(() => {
    setStack([]);
  }, []);

  const value = {
    stack,
    current: stack[stack.length - 1] ?? null,
    openArtist,
    openAlbum,
    goBack,
    closeAll,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx)
    throw new Error("useNavigation must be used within <NavigationProvider>");
  return ctx;
}
