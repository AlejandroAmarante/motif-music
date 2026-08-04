import { getSetting, setSetting } from "../db/settingsRepo.js";

const SETUP_COMPLETE_KEY = "setupComplete";
const MOTIF_FOLDER_ID_KEY = "motifFolderId";

/**
 * Returns `true`/`false` once onboarding has actually run (or been
 * explicitly reset), or `null` if the key has never been written at all —
 * which only happens on a pre-onboarding install being upgraded. That
 * three-way distinction matters: App.jsx only auto-completes setup for an
 * existing library when this is `null`. Reset Setup writes an explicit
 * `false`, so that auto-complete heuristic no longer fires and onboarding
 * reliably shows again even though the user's folders are still connected.
 */
export async function isSetupComplete() {
  return getSetting(SETUP_COMPLETE_KEY, null);
}

export async function markSetupComplete() {
  await setSetting(SETUP_COMPLETE_KEY, true);
}

/** Wipes the "setup done" flag and reloads, so the user sees the first-run flow again. Folders and library data are untouched — this only resets onboarding state. */
export async function resetSetup() {
  await setSetting(SETUP_COMPLETE_KEY, false);
  window.location.reload();
}

export async function getMotifFolderId() {
  return getSetting(MOTIF_FOLDER_ID_KEY, null);
}

export async function setMotifFolderId(id) {
  await setSetting(MOTIF_FOLDER_ID_KEY, id);
}
