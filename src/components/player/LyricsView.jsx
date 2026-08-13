// src/components/player/LyricsView.jsx — full updated file (calls resolveLyricsForSong instead of fetchLrclibLyrics directly)

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { resolveLyricsForSong } from "../../library/lyricsResolver.js";
import { setLyrics } from "../../db/songsRepo.js";

function activeLineIndex(synced, currentTime) {
  if (!synced?.length) return -1;

  let idx = -1;

  for (let i = 0; i < synced.length; i += 1) {
    if (synced[i].time <= currentTime) {
      idx = i;
    } else {
      break;
    }
  }

  return idx;
}

const lyricsTransition = {
  duration: 0.26,
  ease: [0.22, 1, 0.36, 1],
};

export function LyricsView({ isOpen, onClose, song, currentTime, onSeekTo }) {
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

    // Lazy, on-demand only: checks the sidecar .lrc and embedded tag
    // lyrics first, and only reaches out to LRCLIB if neither is
    // present. See lyricsResolver.js — this never runs during a scan.
    resolveLyricsForSong(song).then((result) => {
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
    const justOpened = isOpen && !wasOpenRef.current;

    wasOpenRef.current = isOpen;

    if (!isOpen || activeIdx < 0) return;

    lineRefs.current[activeIdx]?.scrollIntoView({
      block: "center",
      behavior: justOpened ? "auto" : "smooth",
    });
  }, [activeIdx, isOpen]);

  const notFound =
    song?.lyrics === false || (fetchState === "done" && song?.lyrics == null);

  return (
    <AnimatePresence>
      {isOpen && song && (
        <motion.div
          key="lyrics-view"
          className="lyrics-view"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={lyricsTransition}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onTouchStart={(event) => {
            event.stopPropagation();
          }}
        >
          <div className="now-playing__handle-zone">
            <button
              className="now-playing__collapse"
              onClick={onClose}
              aria-label="Close lyrics"
            >
              <ChevronDown size={25} strokeWidth={2} />
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
              <p className="lyrics-view__status">
                No lyrics found for this track.
              </p>
            )}

            {fetchState !== "loading" &&
              !notFound &&
              (synced ? (
                <div className="lyrics-view__lines">
                  {synced.map((line, i) => (
                    <p
                      key={`${line.time}-${i}`}
                      ref={(el) => {
                        lineRefs.current[i] = el;
                      }}
                      className={`lyrics-view__line${
                        i === activeIdx ? " is-active" : ""
                      }`}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
