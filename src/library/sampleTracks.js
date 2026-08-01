// Motif never bundles or duplicates real music (see library/scanner.js) —
// these three clips exist purely so the app is testable with real audio
// playback before you've connected a folder of your own. They're short,
// synthesized placeholder tones generated locally for this build (see
// public/samples/), not licensed or downloaded music, and are labeled as
// such in the UI. Swap in real royalty-free files at the same paths and
// update this manifest if you'd rather ship actual music.
export const SAMPLE_TRACKS = [
  {
    id: 'sample_quiet-morning',
    title: 'Quiet Morning',
    artist: 'Motif Samples',
    album: 'Placeholder Tones',
    duration: 18,
    sampleUrl: '/samples/quiet-morning.wav'
  },
  {
    id: 'sample_late-drive',
    title: 'Late Drive',
    artist: 'Motif Samples',
    album: 'Placeholder Tones',
    duration: 14,
    sampleUrl: '/samples/late-drive.wav'
  },
  {
    id: 'sample_soft-focus',
    title: 'Soft Focus',
    artist: 'Motif Samples',
    album: 'Placeholder Tones',
    duration: 16,
    sampleUrl: '/samples/soft-focus.wav'
  }
];
