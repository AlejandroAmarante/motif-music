import { useEffect, useRef, useState } from 'react';
import { onToast } from '../../state/toastBus.js';

const EXIT_DURATION = 200;

export function ToastHost() {
  const [toasts, setToasts] = useState([]);
  const [leavingIds, setLeavingIds] = useState(() => new Set());
  const timers = useRef(new Map());

  useEffect(() => {
    return onToast((toast) => {
      setToasts((prev) => [...prev, toast]);
      const dismissTimer = setTimeout(() => dismiss(toast.id), toast.duration);
      timers.current.set(toast.id, dismissTimer);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = (id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setLeavingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      setLeavingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, EXIT_DURATION);
  };

  if (!toasts.length) return null;

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`toast toast--${toast.type}${leavingIds.has(toast.id) ? ' is-leaving' : ''}`}
          onClick={() => dismiss(toast.id)}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
