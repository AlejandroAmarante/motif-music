const listeners = new Set();

export function notifyLibraryChanged() {
  listeners.forEach((fn) => fn());
}

export function onLibraryChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
