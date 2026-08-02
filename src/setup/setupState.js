import { getSetting, setSetting } from "../db/settingsRepo.js";

const SETUP_COMPLETE_KEY = "setupComplete";
const MOTIF_FOLDER_ID_KEY = "motifFolderId";

export async function isSetupComplete() {
  return getSetting(SETUP_COMPLETE_KEY, false);
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
