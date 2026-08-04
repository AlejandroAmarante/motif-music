import { useEffect, useState } from "react";
import { LibraryProvider } from "./state/LibraryContext.jsx";
import { PlayerProvider, usePlayer } from "./state/PlayerContext.jsx";
import { UpdateProvider } from "./state/UpdateContext.jsx";
import { BottomNav } from "./components/layout/BottomNav.jsx";
import { MiniPlayer } from "./components/player/MiniPlayer.jsx";
import { NowPlaying } from "./components/player/NowPlaying.jsx";
import { ToastHost } from "./components/common/ToastHost.jsx";
import { HomeView } from "./views/HomeView.jsx";
import { LibraryView } from "./views/LibraryView.jsx";
import { SearchView } from "./views/SearchView.jsx";
import { QueueView } from "./views/QueueView.jsx";
import { SettingsView } from "./views/SettingsView.jsx";
import { ConnectedFoldersView } from "./views/ConnectedFoldersView.jsx";
import { SetupFlow } from "./views/SetupFlow.jsx";
import { isSetupComplete, markSetupComplete } from "./setup/setupState.js";
import { listLibraryFolders } from "./library/libraryManager.js";

const VIEWS = {
  home: HomeView,
  library: LibraryView,
  search: SearchView,
  queue: QueueView,
};

function AppShell() {
  const [tab, setTab] = useState("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const { current } = usePlayer();
  const ActiveView = VIEWS[tab];

  const openFolders = () => setFoldersOpen(true);

  return (
    <>
      <main
        className={`app-main${current ? " app-main--with-miniplayer" : ""}`}
      >
        <ActiveView
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenFolders={openFolders}
        />
      </main>
      {current && <MiniPlayer />}
      <BottomNav active={tab} onChange={setTab} />
      <NowPlaying />
      <SettingsView
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenFolders={openFolders}
      />
      <ConnectedFoldersView
        isOpen={foldersOpen}
        onClose={() => setFoldersOpen(false)}
      />
      <ToastHost />
    </>
  );
}

export default function App() {
  // null (still checking) is distinct from setupComplete === false below —
  // isSetupComplete() itself can also resolve to null, meaning the setting
  // was never written at all (a pre-onboarding install being upgraded).
  // Only THAT case gets auto-completed when folders already exist; an
  // explicit Reset Setup writes a real `false`, which must be left alone
  // or the app would immediately re-complete itself since the user's
  // folders are deliberately left connected.
  const [setupComplete, setSetupComplete] = useState(null);

  useEffect(() => {
    (async () => {
      const stored = await isSetupComplete(); // true | false | null
      let complete = stored;
      if (stored === null) {
        const folders = await listLibraryFolders();
        complete = folders.length > 0;
        if (complete) await markSetupComplete();
      }
      setSetupComplete(Boolean(complete));
    })();
  }, []);

  if (setupComplete === null) {
    return <div className="app-loading" aria-hidden="true" />;
  }

  if (!setupComplete) {
    return <SetupFlow onComplete={() => setSetupComplete(true)} />;
  }

  return (
    <LibraryProvider>
      <PlayerProvider>
        <UpdateProvider>
          <AppShell />
        </UpdateProvider>
      </PlayerProvider>
    </LibraryProvider>
  );
}
