function clearAppBrowserStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.clear();
  } catch {
    // Ignore browser storage cleanup errors.
  }

  try {
    window.sessionStorage.clear();
  } catch {
    // Ignore browser storage cleanup errors.
  }
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.addEventListener("load", () => {
    clearAppBrowserStorage();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });
    }

    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => {
          void caches.delete(key);
        });
      });
    }
  });
}
