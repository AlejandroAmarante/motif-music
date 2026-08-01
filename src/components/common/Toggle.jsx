export function Toggle({ checked, onChange, label, description, id }) {
  return (
    <label className="toggle-row" htmlFor={id}>
      <span className="toggle-row__text">
        <span className="toggle-row__label">{label}</span>
        {description && <span className="toggle-row__desc">{description}</span>}
      </span>
      <span className={`toggle-switch${checked ? ' is-on' : ''}`}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="toggle-switch__input"
        />
        <span className="toggle-switch__track">
          <span className="toggle-switch__thumb" />
        </span>
      </span>
    </label>
  );
}
