import { useState } from 'react';
import { LibraryProvider } from './state/LibraryContext.jsx';
import { PlayerProvider, usePlayer } from './state/PlayerContext.jsx';
import { BottomNav } from './components/layout/BottomNav.jsx';
import { MiniPlayer } from './components/player/MiniPlayer.jsx';
import { NowPlaying } from './components/player/NowPlaying.jsx';
import { ToastHost } from './components/common/ToastHost.jsx';
import { HomeView } from './views/HomeView.jsx';
import { LibraryView } from './views/LibraryView.jsx';
import { SearchView } from './views/SearchView.jsx';
import { QueueView } from './views/QueueView.jsx';
import { SettingsView } from './views/SettingsView.jsx';
import { ConnectedFoldersView } from './views/ConnectedFoldersView.jsx';

const VIEWS = {
  home: HomeView,
  library: LibraryView,
  search: SearchView,
  queue: QueueView
};

function AppShell() {
  const [tab, setTab] = useState('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const { current } = usePlayer();
  const ActiveView = VIEWS[tab];

  const openFolders = () => setFoldersOpen(true);

  return (
    <>
      <main className="app-main">
        <ActiveView onOpenSettings={() => setSettingsOpen(true)} onOpenFolders={openFolders} />
      </main>
      {current && <MiniPlayer />}
      <BottomNav active={tab} onChange={setTab} />
      <NowPlaying />
      <SettingsView isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onOpenFolders={openFolders} />
      <ConnectedFoldersView isOpen={foldersOpen} onClose={() => setFoldersOpen(false)} />
      <ToastHost />
    </>
  );
}

export default function App() {
  return (
    <LibraryProvider>
      <PlayerProvider>
        <AppShell />
      </PlayerProvider>
    </LibraryProvider>
  );
}
