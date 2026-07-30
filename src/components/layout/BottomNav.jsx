const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'library', label: 'Library' },
  { id: 'search', label: 'Search' },
  { id: 'queue', label: 'Queue' }
];

const ICONS = {
  home: (
    <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  ),
  library: (
    <>
      <rect x="4" y="4" width="4" height="16" rx="1" />
      <rect x="10" y="4" width="4" height="16" rx="1" />
      <path d="M17 4.6 20.6 6l-4.6 14-3.6-1.4z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="20" y1="20" x2="15.3" y2="15.3" />
    </>
  ),
  queue: (
    <>
      <line x1="4" y1="6" x2="16" y2="6" />
      <line x1="4" y1="12" x2="16" y2="12" />
      <line x1="4" y1="18" x2="12" y2="18" />
      <path d="M19 9v10M19 9l3 2.5M19 9l-3 2.5" transform="translate(0 -2)" />
    </>
  )
};

export function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            className={`bottom-nav__item${isActive ? ' is-active' : ''}`}
            onClick={() => onChange(tab.id)}
            aria-current={isActive ? 'page' : undefined}
          >
            <svg className="bottom-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[tab.id]}
            </svg>
            <span>{tab.label}</span>
            {isActive && (
              <span className="motif-mark static" aria-hidden="true">
                <span /><span /><span /><span />
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
