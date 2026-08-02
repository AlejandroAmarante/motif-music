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
  const [fetchState, setFetchState] = useState("idle"); // 'idle' | 'loading' | 'done'

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

  useEffect(() => {
    if (activeIdx < 0) return;
    lineRefs.current[activeIdx]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [activeIdx]);

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
        <div style={{ width: 22 }} />
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
