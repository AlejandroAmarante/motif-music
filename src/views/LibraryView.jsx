import { FolderPicker } from '../components/library/FolderPicker.jsx';
import { SongList } from '../components/library/SongList.jsx';
import { useLibrary } from '../state/LibraryContext.jsx';

export function LibraryView() {
  const { version } = useLibrary();

  return (
    <div className="view library-view">
      <header className="view__header">
        <h1>Library</h1>
      </header>
      <div className="library-view__folders">
        <FolderPicker />
      </div>
      <SongList
        version={version}
        sortIndex="byTitleLower"
        emptyState="Songs you add will show up here, sorted by title."
      />
    </div>
  );
}
