/**
 * Places a bundled sample audio file into a real library folder so it goes
 * through the exact same import path as any other song — deliberately NOT
 * a special playback mode. AudioEngine no longer knows "sample tracks"
 * exist at all; this just writes a file, then the normal scanner picks it
 * up. The asset itself ships separately — drop it at the path below.
 */
const SAMPLE_ASSET_PATH = "/samples/welcome-to-motif.mp3";
const SAMPLE_FILE_NAME = "Welcome to Motif.mp3";

export async function importSampleTrack(dirHandle) {
  const response = await fetch(SAMPLE_ASSET_PATH);
  if (!response.ok) {
    throw new Error("The sample track asset is missing from this build.");
  }
  const bytes = await response.arrayBuffer();
  const fileHandle = await dirHandle.getFileHandle(SAMPLE_FILE_NAME, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
}
