function shuffledOrder(length, keepFirst) {
  const order = Array.from({ length }, (_, i) => i);
  // Fisher-Yates, but pin `keepFirst` at position 0 so the currently
  // playing track doesn't jump when shuffle is toggled mid-playback.
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (keepFirst != null) {
    const pos = order.indexOf(keepFirst);
    if (pos > 0) {
      [order[0], order[pos]] = [order[pos], order[0]];
    }
  }
  return order;
}

/**
 * Concrete queue implementation — no strategy interface, since there's
 * exactly one queue behavior in the product today. If Motif ever grows
 * multiple distinct queueing strategies (e.g. radio-style infinite queues),
 * that's the point to extract an interface — not before.
 */
export class Queue {
  constructor() {
    this.songs = []; // full song objects, in original (non-shuffled) order
    this.index = 0; // pointer into `order`
    this.order = []; // sequence of indices into `songs`
    this.shuffle = false;
    this.repeatMode = 'off'; // 'off' | 'all' | 'one'
    this._listeners = new Set();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    this._listeners.forEach((fn) => fn(this.snapshot()));
  }

  snapshot() {
    return {
      songs: this.songs,
      order: this.order,
      index: this.index,
      shuffle: this.shuffle,
      repeatMode: this.repeatMode,
      current: this.current()
    };
  }

  set(songs, startAt = 0) {
    this.songs = songs;
    this.order = this.shuffle ? shuffledOrder(songs.length, startAt) : songs.map((_, i) => i);
    this.index = this.shuffle ? 0 : startAt;
    this._emit();
  }

  current() {
    if (!this.songs.length) return null;
    return this.songs[this.order[this.index]] ?? null;
  }

  peekNext() {
    if (!this.songs.length) return null;
    if (this.repeatMode === 'one') return this.current();
    const nextIndex = this.index + 1;
    if (nextIndex < this.order.length) return this.songs[this.order[nextIndex]];
    if (this.repeatMode === 'all') return this.songs[this.order[0]];
    return null;
  }

  next() {
    if (!this.songs.length) return null;
    if (this.repeatMode === 'one') {
      this._emit();
      return this.current();
    }
    if (this.index + 1 < this.order.length) {
      this.index += 1;
    } else if (this.repeatMode === 'all') {
      this.index = 0;
    } else {
      return null; // end of queue
    }
    this._emit();
    return this.current();
  }

  /**
   * Advances to the next track regardless of repeat mode — used when the
   * current track failed to load. Normal next() intentionally stays put in
   * repeat-one mode, which is correct for playback but would retry a
   * broken file forever if reused for failure recovery.
   */
  forceAdvance() {
    if (!this.songs.length) return null;
    if (this.index + 1 < this.order.length) {
      this.index += 1;
    } else {
      this.index = 0;
    }
    this._emit();
    return this.current();
  }

  previous() {
    if (!this.songs.length) return null;
    if (this.index > 0) {
      this.index -= 1;
    } else if (this.repeatMode === 'all') {
      this.index = this.order.length - 1;
    }
    this._emit();
    return this.current();
  }

  toggleShuffle() {
    this.setShuffle(!this.shuffle);
  }

  setShuffle(on) {
    this.shuffle = on;
    const currentSongIndex = this.order[this.index];
    this.order = on ? shuffledOrder(this.songs.length, currentSongIndex) : this.songs.map((_, i) => i);
    this.index = this.order.indexOf(currentSongIndex);
    this._emit();
  }

  cycleRepeat() {
    const next = { off: 'all', all: 'one', one: 'off' }[this.repeatMode];
    this.repeatMode = next;
    this._emit();
  }

  /** Inserts a song to play immediately after the current one. */
  playNext(song) {
    this.songs.push(song);
    const newSongIndex = this.songs.length - 1;
    this.order.splice(this.index + 1, 0, newSongIndex);
    this._emit();
  }

  addToEnd(song) {
    this.songs.push(song);
    this.order.push(this.songs.length - 1);
    this._emit();
  }

  removeAt(orderPosition) {
    if (orderPosition === this.index) return; // don't remove what's playing
    this.order.splice(orderPosition, 1);
    if (orderPosition < this.index) this.index -= 1;
    this._emit();
  }

  orderedSongs() {
    return this.order.map((i) => this.songs[i]);
  }
}
