export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .catch(() => {
          // no-op: privacy-first, no logging
        });
    });
  }
}

