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
  // null = still checking. If setup was never marked complete but the DB
  // already has folders (an existing install from before this feature
  // shipped), treat it as complete instead of forcing onboarding on
  // someone who's already set up.
  const [setupComplete, setSetupComplete] = useState(null);

  useEffect(() => {
    (async () => {
      let complete = await isSetupComplete();
      if (!complete) {
        const folders = await listLibraryFolders();
        if (folders.length > 0) {
          await markSetupComplete();
          complete = true;
        }
      }
      setSetupComplete(complete);
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
