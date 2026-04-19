function clearAppBrowserStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  const wipeStorage = (storage: Storage | null) => {
    if (!storage) {
      return;
    }

    const keysToDelete: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index) ?? "";
      if (
        key.startsWith("cashbook:") ||
        key.startsWith("cashbook.") ||
        (key.startsWith("sb-") && key.includes("-auth-token"))
      ) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => {
      storage.removeItem(key);
    });
  };

  try {
    wipeStorage(window.localStorage);
  } catch {
    // Ignore browser storage cleanup errors.
  }

  try {
    wipeStorage(window.sessionStorage);
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
