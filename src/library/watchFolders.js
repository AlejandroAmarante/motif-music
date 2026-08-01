export function isWatchSupported() {
  return typeof window !== 'undefined' && 'FileSystemObserver' in window;
}

/**
 * FileSystemObserver is very new and not widely shipped yet — this is
 * deliberately defensive. If it's unsupported, or if construction/observe
 * throws for any reason, we call onUnsupported() once and return a no-op
 * cleanup so the caller can fall back to another scan strategy rather than
 * silently doing nothing forever.
 */
export function watchFolders(directoryRecords, onChange, { onUnsupported, debounceMs = 1500 } = {}) {
  if (!isWatchSupported()) {
    onUnsupported?.();
    return () => {};
  }

  const observers = [];
  let debounceTimer = null;
  const debouncedChange = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(onChange, debounceMs);
  };

  let anyObserving = false;
  for (const record of directoryRecords) {
    try {
      // eslint-disable-next-line no-undef
      const observer = new FileSystemObserver(debouncedChange);
      observer.observe(record.handle, { recursive: true });
      observers.push(observer);
      anyObserving = true;
    } catch (err) {
      console.warn('[motif/watch] could not observe', record.name, err);
    }
  }

  if (!anyObserving) {
    onUnsupported?.();
  }

  return () => {
    clearTimeout(debounceTimer);
    observers.forEach((o) => o.disconnect?.());
  };
}
