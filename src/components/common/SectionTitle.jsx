/**
 * Icon + label heading used to open a settings-style section (Settings,
 * Connected Folders). Pulled out of both views since it was defined
 * identically in each.
 */
export function SectionTitle({ icon: Icon, children }) {
  return (
    <h2 className="home-rail__title">
      <span className="home-rail__icon" aria-hidden="true">
        <Icon size={20} strokeWidth={1.8} />
      </span>
      {children}
    </h2>
  );
}
