import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useMountTransition } from "../../utils/useMountTransition.js";
import { fetchLrclibLyrics } from "../../library/lrclib.js";
import { setLyrics } from "../../db/songsRepo.js";

function activeLineIndex(synced, currentTime) {
  if (!synced?.length) return -1;
  let idx = -1;
  for (let i = 0; i < synced.length; i += 1) {
    if (synced[i].time <= currentTime) idx = i;
    else break;
  }
  return idx;
}

export function LyricsView({ isOpen, onClose, song, currentTime, onSeekTo }) {
  const { shouldRender, entered } = useMountTransition(isOpen, 260);
  const lineRefs = useRef([]);
  const wasOpenRef = useRef(false);
  const [fetchState, setFetchState] = useState("idle");

  useEffect(() => {
    if (!isOpen || !song || song.lyrics != null) {
      setFetchState("idle");
      return undefined;
    }
    let cancelled = false;
    setFetchState("loading");
    fetchLrclibLyrics({
      title: song.title,
      artist: song.artist,
      album: song.album,
      duration: song.duration,
    }).then((result) => {
      if (cancelled) return;
      if (result !== null) {
        song.lyrics = result;
        setLyrics(song.id, result).catch(() => {});
      }
      setFetchState("done");
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, song]);

  const synced = song?.lyrics?.synced ?? null;
  const activeIdx = useMemo(
    () => activeLineIndex(synced, currentTime),
    [synced, currentTime],
  );

  // Keeps the current line centered as playback advances, but also — the
  // actual fix here — re-centers it every time the sheet is (re)opened,
  // not just when the active line itself changes. Without `shouldRender`
  // and `isOpen` in the deps, opening the sheet while the active line
  // *hadn't* changed since the last time it was open (the common case: the
  // line refs get wiped on close, but activeIdx keeps quietly tracking in
  // the background since this component never unmounts) meant this effect
  // simply had nothing new to react to, so the sheet opened wherever it
  // last happened to be scrolled instead of centered on the lyric. Because
  // `shouldRender` flips true one render *after* `isOpen` does (see
  // useMountTransition), depending on it here is what makes this re-fire
  // once the line elements actually exist to scroll to.
  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!isOpen || !shouldRender || activeIdx < 0) return;
    lineRefs.current[activeIdx]?.scrollIntoView({
      block: "center",
      // Instant on open — a visible smooth-scroll right as the sheet is
      // also sliding up would read as a glitch rather than "already
      // centered." Playback-driven advances stay smooth.
      behavior: justOpened ? "auto" : "smooth",
    });
  }, [activeIdx, isOpen, shouldRender]);

  if (!shouldRender || !song) return null;

  const notFound =
    song.lyrics === false || (fetchState === "done" && song.lyrics == null);

  return (
    <div className={`lyrics-view${entered ? " is-open" : ""}`}>
      <div className="now-playing__handle-zone">
        <button
          className="now-playing__collapse"
          onClick={onClose}
          aria-label="Close lyrics"
        >
          <ChevronDown size={22} strokeWidth={2} />
        </button>
        <span className="now-playing__eyebrow">Lyrics</span>
        <div className="now-playing__spacer" />
      </div>

      <div className="lyrics-view__body scroll-region">
        <p className="lyrics-view__heading">{song.title}</p>
        <p className="lyrics-view__subheading">{song.artist}</p>

        {fetchState === "loading" && (
          <p className="lyrics-view__status">Looking for lyrics…</p>
        )}

        {fetchState !== "loading" && notFound && (
          <p className="lyrics-view__status">No lyrics found for this track.</p>
        )}

        {fetchState !== "loading" &&
          !notFound &&
          (synced ? (
            <div className="lyrics-view__lines">
              {synced.map((line, i) => (
                <p
                  key={`${line.time}-${i}`}
                  ref={(el) => (lineRefs.current[i] = el)}
                  className={`lyrics-view__line${i === activeIdx ? " is-active" : ""}`}
                  onClick={() => onSeekTo(line.time)}
                  role="button"
                  tabIndex={0}
                >
                  {line.text}
                </p>
              ))}
            </div>
          ) : (
            <p className="lyrics-view__plain">{song.lyrics?.text}</p>
          ))}
      </div>
    </div>
  );
}
