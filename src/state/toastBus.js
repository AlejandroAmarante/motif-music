let counter = 0;
const listeners = new Set();

export function pushToast(message, { type = 'info', duration = 3200 } = {}) {
  const toast = { id: ++counter, message, type, duration };
  listeners.forEach((fn) => fn(toast));
  return toast.id;
}

export function onToast(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
