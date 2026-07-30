import { Queue } from './queue.js';
import { resolveFile } from '../library/resolveFile.js';
import { recordPlay } from '../db/songsRepo.js';
import { updateMediaSessionMetadata, updatePlaybackState, updatePositionState } from './mediaSession.js';

export class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.queue = new Queue();
    this._objectUrl = null;
    this._buffering = false;
    this._countedThisTrack = false;
    this._listeners = new Set();

    this.queue.onChange(() => this._emit());
    this._bindAudioEvents();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    const state = this.getState();
    this._listeners.forEach((fn) => fn(state));
  }

  getState() {
    return {
      current: this.queue.current(),
      upNext: this.queue.peekNext(),
      queueSongs: this.queue.orderedSongs(),
      queueIndex: this.queue.index,
      isPlaying: !this.audio.paused && !this.audio.ended,
      buffering: this._buffering,
      currentTime: this.audio.currentTime || 0,
      duration: this.audio.duration || this.queue.current()?.duration || 0,
      volume: this.audio.volume,
      muted: this.audio.muted,
      playbackRate: this.audio.playbackRate,
      shuffle: this.queue.shuffle,
      repeatMode: this.queue.repeatMode
    };
  }

  async playQueue(songs, startAt = 0) {
    this.queue.set(songs, startAt);
    await this._loadCurrent();
    await this.play();
  }

  async _loadCurrent() {
    const song = this.queue.current();
    if (!song) return;
    this._buffering = true;
    this._countedThisTrack = false;
    this._emit();
    try {
      const file = await resolveFile(song);
      if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
      this._objectUrl = URL.createObjectURL(file);
      this.audio.src = this._objectUrl;
      await updateMediaSessionMetadata(song);
    } catch (err) {
      console.error('[motif/audio] could not load', song?.title, err);
      await this.next();
    } finally {
      this._buffering = false;
      this._emit();
    }
  }

  async play() {
    try {
      await this.audio.play();
    } catch (err) {
      console.warn('[motif/audio] play() rejected (likely needs a user gesture):', err.message);
    }
  }

  pause() {
    this.audio.pause();
  }

  toggle() {
    if (this.audio.paused) this.play();
    else this.pause();
  }

  seek(time) {
    if (Number.isFinite(time)) this.audio.currentTime = time;
  }

  setVolume(v) {
    this.audio.volume = Math.min(1, Math.max(0, v));
    if (this.audio.volume > 0) this.audio.muted = false;
    this._emit();
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    this._emit();
  }

  setPlaybackRate(rate) {
    this.audio.playbackRate = rate;
    this._emit();
  }

  toggleShuffle() {
    this.queue.toggleShuffle();
  }

  cycleRepeat() {
    this.queue.cycleRepeat();
  }

  async next() {
    const song = this.queue.next();
    if (song) {
      await this._loadCurrent();
      await this.play();
    } else {
      this.pause();
    }
  }

  /** Spotify-style behavior: restart the track if we're more than 3s in. */
  async previous() {
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }
    const song = this.queue.previous();
    if (song) {
      await this._loadCurrent();
      await this.play();
    }
  }

  playNext(song) {
    this.queue.playNext(song);
  }

  addToQueue(song) {
    this.queue.addToEnd(song);
  }

  async playFromQueue(orderPosition) {
    this.queue.index = orderPosition;
    await this._loadCurrent();
    await this.play();
  }

  removeFromQueue(orderPosition) {
    this.queue.removeAt(orderPosition);
  }

  _bindAudioEvents() {
    this.audio.addEventListener('play', () => {
      updatePlaybackState('playing');
      this._emit();
    });
    this.audio.addEventListener('pause', () => {
      updatePlaybackState('paused');
      this._emit();
    });
    this.audio.addEventListener('timeupdate', () => {
      this._maybeRecordPlay();
      updatePositionState({
        duration: this.audio.duration,
        position: this.audio.currentTime,
        playbackRate: this.audio.playbackRate
      });
      this._emit();
    });
    this.audio.addEventListener('waiting', () => {
      this._buffering = true;
      this._emit();
    });
    this.audio.addEventListener('canplay', () => {
      this._buffering = false;
      this._emit();
    });
    this.audio.addEventListener('ended', () => {
      this._maybeRecordSkip();
      this.next();
    });
    this.audio.addEventListener('error', () => {
      console.error('[motif/audio] element error, skipping track');
      this.next();
    });
  }

  /** Counts a play once listened past 50% of duration or 30s, whichever is shorter. */
  _maybeRecordPlay() {
    if (this._countedThisTrack) return;
    const threshold = Math.min(30, (this.audio.duration || 0) / 2);
    if (threshold > 0 && this.audio.currentTime >= threshold) {
      this._countedThisTrack = true;
      const song = this.queue.current();
      if (song) recordPlay(song.id, { completed: true });
    }
  }

  _maybeRecordSkip() {
    if (this._countedThisTrack) return;
    const song = this.queue.current();
    if (song) recordPlay(song.id, { completed: false });
  }
}
