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

export type DetectedPlatform = 'android' | 'ios' | 'desktop';

interface PwaContextValue {
  swRegistered: boolean;
  canInstall: boolean;
  isStandalone: boolean;
  isSecureContext: boolean;
  isInAppBrowser: boolean;
  platform: DetectedPlatform;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

const PwaContext = createContext<PwaContextValue | null>(null);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [swRegistered, setSwRegistered] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isSecureContext, setIsSecureContext] = useState(true);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [platform, setPlatform] = useState<DetectedPlatform>('desktop');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) setPlatform('android');
    else if (/iPhone|iPad|iPod/i.test(ua)) setPlatform('ios');
    else setPlatform('desktop');

    setIsInAppBrowser(
      /FBAN|FBAV|Instagram|WhatsApp|Line\/|Twitter|LinkedInApp|GSA\//i.test(ua) ||
        /; wv\)/i.test(ua),
    );
    setIsSecureContext(window.isSecureContext);

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

  const promptInstall = useCallback(async (): Promise<
    'accepted' | 'dismissed' | 'unavailable'
  > => {
    if (!deferredPrompt) return 'unavailable';
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setDeferredPrompt(null);
      return 'accepted';
    }
    return 'dismissed';
  }, [deferredPrompt]);

  return (
    <PwaContext.Provider
      value={{
        swRegistered,
        canInstall: Boolean(deferredPrompt) && !isStandalone,
        isStandalone,
        isSecureContext,
        isInAppBrowser,
        platform,
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
