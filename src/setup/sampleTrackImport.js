/**
 * Places a bundled sample audio file into a real library folder so it goes
 * through the exact same import path as any other song — deliberately NOT
 * a special playback mode. AudioEngine no longer knows "sample tracks"
 * exist at all; this just writes a file, then the normal scanner picks it
 * up. The asset itself ships separately, at public/samples/welcome-to-motif.mp3.
 */
const SAMPLE_ASSET_RELATIVE_PATH = "samples/Grand Dark Waltz Trio Vivace.mp3";
const SAMPLE_FILE_NAME = "Grand Dark Waltz Trio Vivace.mp3";

export async function importSampleTrack(dirHandle) {
  // Resolve against BASE_URL rather than an absolute "/samples/..." path —
  // vite.config.js sets `base: "/motif-music/"` for GitHub Pages, so a
  // root-relative path 404s in any deployment that isn't served from the
  // domain root. import.meta.env.BASE_URL always reflects the real base
  // Vite built with and always ends in a trailing slash.
  const assetUrl = `${import.meta.env.BASE_URL}${SAMPLE_ASSET_RELATIVE_PATH}`;

  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error(
      `The sample track asset is missing from this build (expected at ${assetUrl}).`,
    );
  }
  const bytes = await response.arrayBuffer();

  const fileHandle = await dirHandle.getFileHandle(SAMPLE_FILE_NAME, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();

  // Confirm the write actually landed before the caller proceeds to scan
  // the folder — surfaces a clear error instead of a silent "0 songs
  // found" if the write didn't fully commit for some reason.
  const verifyHandle = await dirHandle.getFileHandle(SAMPLE_FILE_NAME);
  const verifyFile = await verifyHandle.getFile();
  if (verifyFile.size === 0) {
    throw new Error(
      "The sample track was written but came out empty — try again.",
    );
  }
}
