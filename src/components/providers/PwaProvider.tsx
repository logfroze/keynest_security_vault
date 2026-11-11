'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaContextValue {
  swRegistered: boolean;
  canInstall: boolean;
  isStandalone: boolean;
  promptInstall: () => Promise<boolean>;
}

const PwaContext = createContext<PwaContextValue | null>(null);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [swRegistered, setSwRegistered] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkStandalone = () => {
      const standaloneMatch = window.matchMedia?.('(display-mode: standalone)').matches;
      const iosStandalone = Boolean(
        (window.navigator as Navigator & { standalone?: boolean }).standalone,
      );
      setIsStandalone(Boolean(standaloneMatch || iosStandalone));
    };
    checkStandalone();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(() => setSwRegistered(true))
        .catch(() => setSwRegistered(false));
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  return (
    <PwaContext.Provider
      value={{
        swRegistered,
        canInstall: Boolean(deferredPrompt) && !isStandalone,
        isStandalone,
        promptInstall,
      }}
    >
      {children}
    </PwaContext.Provider>
  );
}

export function usePwa(): PwaContextValue {
  const ctx = useContext(PwaContext);
  if (!ctx) {
    throw new Error('usePwa must be used within PwaProvider');
  }
  return ctx;
}

