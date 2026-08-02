import { Home, Library, Search, ListMusic } from "lucide-react";

const TABS = [
  { id: "home", label: "Home", Icon: Home },
  { id: "library", label: "Library", Icon: Library },
  { id: "search", label: "Search", Icon: Search },
  { id: "queue", label: "Queue", Icon: ListMusic },
];

export function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {TABS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            className={`bottom-nav__item${isActive ? " is-active" : ""}`}
            onClick={() => onChange(id)}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="bottom-nav__icon" size={23} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
