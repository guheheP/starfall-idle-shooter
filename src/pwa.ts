export interface PwaState {
  installed: boolean;
  canInstall: boolean;
  installMethod: 'prompt' | 'ios' | 'browser';
  offlineStatus: 'preparing' | 'ready' | 'unavailable';
  updateReady: boolean;
  online: boolean;
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallResult = 'accepted' | 'dismissed' | 'manual' | 'unavailable' | 'installed';
const listeners = new Set<(state: PwaState) => void>();
let initialized = false;
let promptEvent: InstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | null = null;
const watchedWorkers = new WeakSet<ServiceWorker>();
let state: PwaState = {
  installed: false,
  canInstall: false,
  installMethod: 'browser',
  offlineStatus: 'unavailable',
  updateReady: false,
  online: typeof navigator === 'undefined' || navigator.onLine,
};

function publish(next: Partial<PwaState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener(getPwaState());
}

export function getPwaState(): PwaState { return { ...state }; }

export function subscribePwaState(listener: (state: PwaState) => void): () => void {
  listeners.add(listener);
  listener(getPwaState());
  return () => { listeners.delete(listener); };
}

/** Call directly from a user's click, so the browser retains the required gesture. */
export async function installPwa(): Promise<InstallResult> {
  if (state.installed) return 'installed';
  const event = promptEvent;
  if (!event) return window.isSecureContext ? 'manual' : 'unavailable';
  promptEvent = null;
  publish({ canInstall: false });
  try {
    await event.prompt();
    return (await event.userChoice).outcome;
  } catch {
    return 'unavailable';
  }
}

function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function verifyOfflineCache(worker: ServiceWorker | null): Promise<void> {
  if (!worker || worker.state !== 'activated') return;
  const ready = await new Promise<boolean>(resolve => {
    const channel = new MessageChannel();
    const finish = (value: boolean) => {
      window.clearTimeout(timer);
      channel.port1.close();
      resolve(value);
    };
    const timer = window.setTimeout(() => { finish(false); }, 5000);
    channel.port1.onmessage = event => { finish(event.data?.ready === true); };
    try {
      worker.postMessage({ type: 'STARFALL_OFFLINE_STATUS', repair: navigator.onLine }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
  publish({ offlineStatus: ready ? 'ready' : 'unavailable' });
}

function watchWorker(worker: ServiceWorker | null): void {
  if (!worker || watchedWorkers.has(worker)) return;
  watchedWorkers.add(worker);
  const update = () => {
    if (worker.state === 'activated') {
      publish({ updateReady: !!registration?.waiting });
      void verifyOfflineCache(worker);
    } else if (worker.state === 'installed' && registration?.waiting) {
      publish({ updateReady: true });
    } else if (worker.state === 'redundant' && !registration?.active) {
      publish({ offlineStatus: 'unavailable' });
    }
  };
  worker.addEventListener('statechange', update);
  update();
}

/** Installability is optional; failure never blocks gameplay or changes the player's save. */
export function initializePwa(): void {
  if (initialized) return;
  initialized = true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  publish({ installed: isInstalled(), installMethod: ios ? 'ios' : 'browser' });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event as InstallPromptEvent;
    publish({ canInstall: !state.installed, installMethod: 'prompt' });
  });
  window.addEventListener('appinstalled', () => {
    promptEvent = null;
    publish({ installed: true, canInstall: false });
  });
  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {
    publish({ installed: isInstalled() });
  });
  window.addEventListener('offline', () => { publish({ online: false }); });
  window.addEventListener('online', () => {
    publish({ online: true });
    if (registration) {
      void registration.update().catch(() => {});
      void verifyOfflineCache(registration.active);
    }
  });

  // Development source modules change continuously; only the built game is cached.
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  publish({ offlineStatus: 'preparing' });
  const start = async () => {
    try {
      const base = new URL(import.meta.env.BASE_URL, document.baseURI);
      registration = await navigator.serviceWorker.register(new URL('sw.js', base).href, {
        scope: base.href,
        updateViaCache: 'none',
      });
      publish({ updateReady: !!registration.waiting });
      watchWorker(registration.installing);
      watchWorker(registration.active);
      registration.addEventListener('updatefound', () => { watchWorker(registration?.installing ?? null); });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        void verifyOfflineCache(navigator.serviceWorker.controller);
      });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void verifyOfflineCache(registration?.active ?? null);
      });
      if (registration.active) void verifyOfflineCache(registration.active);
      void navigator.serviceWorker.ready.then(ready => { void verifyOfflineCache(ready.active); });
    } catch {
      publish({ offlineStatus: 'unavailable' });
    }
  };
  if (document.readyState === 'complete') void start();
  else window.addEventListener('load', () => { void start(); }, { once: true });
}
