"use client";
import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && "serviceWorker" in navigator) {
      // Support GitHub Pages subpaths by using base path from current location
      const base = (document.querySelector('base')?.getAttribute('href')) || '/';
      const swUrl = new URL('sw.js', base).toString();
      navigator.serviceWorker.register(swUrl).catch(() => {});
    }
    // Dev: ensure any previously installed SW is removed and its caches cleared
    if (process.env.NODE_ENV !== 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations?.().then((regs) => {
        regs.forEach((r) => r.unregister().catch(() => {}));
      });
      if (typeof caches !== 'undefined') {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .catch(() => {});
      }
    }
  }, []);
  return null;
}


