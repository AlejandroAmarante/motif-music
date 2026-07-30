import { useState } from 'react';
import { LibraryProvider } from './state/LibraryContext.jsx';
import { PlayerProvider, usePlayer } from './state/PlayerContext.jsx';
import { BottomNav } from './components/layout/BottomNav.jsx';
import { MiniPlayer } from './components/player/MiniPlayer.jsx';
import { NowPlaying } from './components/player/NowPlaying.jsx';
import { HomeView } from './views/HomeView.jsx';
import { LibraryView } from './views/LibraryView.jsx';
import { SearchView } from './views/SearchView.jsx';
import { QueueView } from './views/QueueView.jsx';
import { SettingsView } from './views/SettingsView.jsx';

const VIEWS = {
  home: HomeView,
  library: LibraryView,
  search: SearchView,
  queue: QueueView
};

function AppShell() {
  const [tab, setTab] = useState('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { current } = usePlayer();
  const ActiveView = VIEWS[tab];

  return (
    <>
      <main className="app-main">
        <ActiveView onOpenSettings={() => setSettingsOpen(true)} />
      </main>
      {current && <MiniPlayer />}
      <BottomNav active={tab} onChange={setTab} />
      <NowPlaying />
      {settingsOpen && <SettingsView onClose={() => setSettingsOpen(false)} />}
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
