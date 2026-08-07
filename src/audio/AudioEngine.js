import { Queue } from "./queue.js";
import { resolveFile } from "../library/resolveFile.js";
import { recordPlay, setLyrics } from "../db/songsRepo.js";
import {
  updateMediaSessionMetadata,
  updatePlaybackState,
  updatePositionState,
} from "./mediaSession.js";
import { pushToast } from "../state/toastBus.js";
import {
  handleLoadFailure,
  handleLoadSuccess,
} from "../library/missingFiles.js";
import { fetchLrclibLyrics, LYRICS_RECHECK_COOLDOWN_MS } from "../library/lrclib.js";
import {
  prefetchAlbumArtwork,
  albumArtworkContext,
} from "../artwork/artworkManager.js";

const MAX_CONSECUTIVE_FAILURES = 8;

export class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.queue = new Queue();
    this._objectUrl = null;
    this._loading = false;
    this._buffering = false;
    this._scrubbing = false;
    this._wasPlayingBeforeScrub = false;
    this._playToken = 0;
    this._lyricsRecheckedThisTrack = false;
    this._countedThisTrack = false;
    this._consecutiveFailures = 0;
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
    const song = this.queue.current();
    return {
      current: song,
      upNext: this.queue.peekNext(),
      queueSongs: this.queue.orderedSongs(),
      queueIndex: this.queue.index,
      isPlaying: !this.audio.paused && !this.audio.ended,
      buffering: this._buffering,
      currentTime: this._loading ? 0 : this.audio.currentTime || 0,
      duration: this._loading
        ? song?.duration || 0
        : this.audio.duration || song?.duration || 0,
      volume: this.audio.volume,
      muted: this.audio.muted,
      playbackRate: this.audio.playbackRate,
      shuffle: this.queue.shuffle,
      repeatMode: this.queue.repeatMode,
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
    this._loading = true;
    this._buffering = true;
    this._countedThisTrack = false;
    this._lyricsRecheckedThisTrack = false;
    this._emit();
    try {
      const file = await resolveFile(song);
      if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
      this._objectUrl = URL.createObjectURL(file);
      this.audio.src = this._objectUrl;
      await updateMediaSessionMetadata(song);
      this._consecutiveFailures = 0;
      handleLoadSuccess(song).catch(() => {});
      prefetchAlbumArtwork(albumArtworkContext(this.queue.peekNext()));
    } catch (err) {
      await this._handleFailure(song, err);
    } finally {
      this._loading = false;
      this._buffering = false;
      this._emit();
    }
  }

  async _handleFailure(song, err) {
    console.error("[motif/audio] could not load", song?.title, err);
    pushToast(`Couldn't play "${song.title}" — skipping`, { type: "error" });
    handleLoadFailure(song).catch(() => {});
    this._consecutiveFailures += 1;
    if (this._consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      this._consecutiveFailures = 0;
      pushToast("Too many tracks failed to load — stopping", { type: "error" });
      this.pause();
      return;
    }
    await this._forceNext();
  }

  async _forceNext() {
    const next = this.queue.forceAdvance();
    if (next) {
      await this._loadCurrent();
      await this.play();
    } else {
      this.pause();
    }
  }

  async play() {
    // Every pause()/play() call bumps this token. If this call's play()
    // promise ends up rejected because a *newer* pause() interrupted it
    // (calling pause() while a play() is still settling is normal browser
    // behavior, not a bug, and always resolves correctly once the newer
    // call's own play()/pause() finishes) — the newer call is already the
    // authoritative one for final playback state, so this stale rejection
    // is expected and safe to swallow silently rather than logging a
    // misleading warning for something that already resolved correctly.
    this._playToken += 1;
    const token = this._playToken;
    try {
      await this.audio.play();
    } catch (err) {
      if (token === this._playToken) {
        console.warn(
          "[motif/audio] play() rejected (likely needs a user gesture):",
          err.message,
        );
      }
    }
  }

  pause() {
    this._playToken += 1; // invalidates any in-flight play()'s warning, same reasoning as above
    this.audio.pause();
  }

  toggle() {
    if (this.audio.paused) this.play();
    else this.pause();
  }

  seek(time) {
    if (Number.isFinite(time)) this.audio.currentTime = time;
  }

  /**
   * Scrubbing is a single, explicit begin → (state updates only) → end
   * sequence with exactly one pause() and, at most, one play() — no
   * playback calls happen in between while dragging, and there's never
   * more than one scrub "session" open at a time (beginScrub is a no-op
   * if one is already in progress). endScrub always performs exactly one
   * seek, then resumes playback exactly once if it was playing before the
   * scrub started, or leaves it paused if it wasn't.
   */
  beginScrub() {
    if (this._scrubbing) return;
    this._scrubbing = true;
    this._wasPlayingBeforeScrub = !this.audio.paused;
    this.audio.pause();
  }

  endScrub(time) {
    this._scrubbing = false;
    this.seek(time);
    if (this._wasPlayingBeforeScrub) this.play();
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

  async _maybeRecheckLyrics() {
    const song = this.queue.current();
    if (!song || song.lyrics !== false || this._lyricsRecheckedThisTrack)
      return;
    this._lyricsRecheckedThisTrack = true;

    // A confirmed "not found" result carries a timestamp of when it was
    // last confirmed (see songsRepo.setLyrics) — skip hitting LRCLIB again
    // until that cooldown has passed, so a song with no lyrics doesn't
    // fire a fresh request to a free, community-run API every single time
    // it happens to be played.
    const lastChecked = song.lyricsCheckedAt ?? 0;
    if (Date.now() - lastChecked < LYRICS_RECHECK_COOLDOWN_MS) return;

    const result = await fetchLrclibLyrics({
      title: song.title,
      artist: song.artist,
      album: song.album,
      duration: song.duration,
    });
    if (result === null) return; // network/CORS hiccup — not a confirmed answer, don't stamp or cache it

    song.lyrics = result === false ? false : result;
    song.lyricsCheckedAt = Date.now();
    setLyrics(song.id, song.lyrics).catch(() => {});
    this._emit();
  }

  _bindAudioEvents() {
    this.audio.addEventListener("play", () => {
      updatePlaybackState("playing");
      this._maybeRecheckLyrics();
      this._emit();
    });
    this.audio.addEventListener("pause", () => {
      updatePlaybackState("paused");
      this._emit();
    });
    this.audio.addEventListener("timeupdate", () => {
      this._maybeRecordPlay();
      updatePositionState({
        duration: this.audio.duration,
        position: this.audio.currentTime,
        playbackRate: this.audio.playbackRate,
      });
      this._emit();
    });
    this.audio.addEventListener("waiting", () => {
      this._buffering = true;
      this._emit();
    });
    this.audio.addEventListener("canplay", () => {
      this._buffering = false;
      this._emit();
    });
    this.audio.addEventListener("seeked", () => {
      this._emit();
    });
    this.audio.addEventListener("ended", () => {
      this._maybeRecordSkip();
      this.next();
    });
    this.audio.addEventListener("error", () => {
      this._handleFailure(this.queue.current(), this.audio.error);
    });
  }

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
