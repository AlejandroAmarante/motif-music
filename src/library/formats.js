export const SUPPORTED_EXTENSIONS = new Map([
  ['mp3', 'audio/mpeg'],
  ['flac', 'audio/flac'],
  ['wav', 'audio/wav'],
  ['ogg', 'audio/ogg'],
  ['opus', 'audio/opus'],
  ['aac', 'audio/aac'],
  ['m4a', 'audio/mp4']
]);

export function isSupportedFile(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export function extensionOf(fileName) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}
