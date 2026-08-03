import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { getSetting, setSetting } from "../db/settingsRepo.js";
import { pushToast } from "./toastBus.js";

const UpdateContext = createContext(null);

const AUTO_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
const UP_TO_DATE_GRACE_MS = 2500; // long enough for a waiting worker to surface after update()

/**
 * Single point of contact with the service worker's update lifecycle.
 * `injectRegister: false` in vite.config.js disables the plugin's own
 * auto-injected register script so this hook is the only thing that ever
 * calls registerSW() — avoids duplicating (and potentially fighting)
 * service-worker registration.
 */
export function UpdateProvider({ children }) {
  const registrationRef = useRef(null);
  const notifiedRef = useRef(false);
  const [autoCheckUpdates, setAutoCheckUpdatesState] = useState(false);
  const [checking, setChecking] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      registrationRef.current = registration || null;
    },
    onRegisterError(error) {
      console.warn("[motif/pwa] service worker registration failed:", error);
    },
  });

  useEffect(() => {
    getSetting("autoCheckUpdates", false).then(setAutoCheckUpdatesState);
  }, []);

  useEffect(() => {
    if (!needRefresh || notifiedRef.current) return;
    notifiedRef.current = true;
    pushToast("An update is ready — tap to refresh Motif.", {
      type: "success",
      duration: 10000,
    });
  }, [needRefresh]);

  const checkForUpdate = useCallback(async ({ silent = false } = {}) => {
    if (!registrationRef.current) {
      if (!silent) {
        pushToast("Updates aren't available in this session.", { type: "info" });
      }
      return;
    }
    setChecking(true);
    if (!silent) pushToast("Checking for updates…", { type: "info", duration: 2000 });
    try {
      await registrationRef.current.update();
    } catch (err) {
      console.warn("[motif/pwa] update check failed:", err);
      if (!silent) {
        pushToast("Couldn't check for updates — try again later.", { type: "error" });
      }
      setChecking(false);
      return;
    }
    // A found update surfaces asynchronously as `needRefresh` once the new
    // worker finishes installing — give it a beat before declaring "up to
    // date" so a real update isn't mislabeled as a no-op.
    setTimeout(() => {
      setChecking(false);
      if (!silent && !notifiedRef.current) {
        pushToast("You're on the latest version of Motif.", { type: "info" });
      }
    }, UP_TO_DATE_GRACE_MS);
  }, []);

  const applyUpdate = useCallback(() => {
    return updateServiceWorker(true);
  }, [updateServiceWorker]);

  const setAutoCheckUpdates = useCallback(async (value) => {
    setAutoCheckUpdatesState(value);
    await setSetting("autoCheckUpdates", value);
  }, []);

  useEffect(() => {
    if (!autoCheckUpdates) return undefined;
    const id = setInterval(() => {
      checkForUpdate({ silent: true });
    }, AUTO_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoCheckUpdates, checkForUpdate]);

  const value = {
    needRefresh,
    checking,
    checkForUpdate,
    applyUpdate,
    autoCheckUpdates,
    setAutoCheckUpdates,
  };

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdateManager() {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useUpdateManager must be used within <UpdateProvider>");
  return ctx;
}
