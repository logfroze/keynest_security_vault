'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Share2,
  Smartphone,
  X,
} from 'lucide-react';
import { usePwa } from '../providers/PwaProvider';

export function InstallAppButton({
  variant = 'header',
}: {
  variant?: 'header' | 'card' | 'compact';
}) {
  const {
    canInstall,
    isStandalone,
    swRegistered,
    isSecureContext,
    isInAppBrowser,
    platform,
    promptInstall,
  } = usePwa();

  const [showGuide, setShowGuide] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (isStandalone) {
    if (variant === 'card') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30">
          <CheckCircle2 className="h-4 w-4" /> Installed as App
        </span>
      );
    }
    return null;
  }

  const handleClick = async () => {
    setStatusMessage(null);
    if (canInstall) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') return;
      if (outcome === 'dismissed') {
        setStatusMessage('Install prompt dismissed — you can install anytime below.');
      }
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className={
          variant === 'card'
            ? 'inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-500'
            : variant === 'compact'
              ? 'inline-flex items-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 dark:bg-teal-500/15 dark:text-teal-300'
              : 'inline-flex items-center gap-1.5 rounded-xl border border-teal-500/40 bg-teal-50 px-3 py-1.5 text-[13px] font-semibold text-teal-700 transition hover:bg-teal-100 dark:bg-teal-500/15 dark:text-teal-300 dark:hover:bg-teal-500/25'
        }
        title="Install KeyNest as a standalone app on this device"
      >
        <Download className="h-3.5 w-3.5" />
        <span>Install App</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-xs dark:bg-black/75"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-[#24303F] dark:bg-[#161D26]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Install KeyNest App
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Standalone app mode (no browser address bar)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Live Readiness Diagnostics */}
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-[#273342] dark:bg-[#0F141A]">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Connection:</span>{' '}
                <strong
                  className={
                    isSecureContext
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }
                >
                  {isSecureContext ? 'HTTPS / Secure' : 'Insecure HTTP'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">PWA Worker:</span>{' '}
                <strong
                  className={
                    swRegistered
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }
                >
                  {swRegistered ? 'Active' : 'Pending'}
                </strong>
              </div>
            </div>

            {!isSecureContext && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Mobile browsers only install standalone apps over <strong>HTTPS</strong> (e.g. your Vercel URL), not over plain <code>http://192.168.x.x</code> Wi-Fi links.
                </span>
              </div>
            )}

            {isInAppBrowser && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200">
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  You opened KeyNest inside an in-app browser (WhatsApp / Gmail / Instagram). Tap the <strong>⋮</strong> menu and choose <strong>Open in Chrome</strong> or <strong>Open in Safari</strong> first.
                </span>
              </div>
            )}

            {statusMessage && (
              <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">
                {statusMessage}
              </p>
            )}

            {canInstall && (
              <button
                type="button"
                onClick={() => void promptInstall()}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-500"
              >
                <Download className="h-4 w-4" /> Install KeyNest Now
              </button>
            )}

            <div className="space-y-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              <div
                className={`rounded-xl border p-3.5 ${
                  platform === 'android'
                    ? 'border-teal-300 bg-teal-50/60 dark:border-teal-500/35 dark:bg-teal-500/10'
                    : 'border-slate-200 bg-slate-50 dark:border-[#273342] dark:bg-[#0F141A]'
                }`}
              >
                <p className="mb-1 font-bold text-slate-900 dark:text-white">
                  Android (Chrome / Edge)
                </p>
                <ol className="list-inside list-decimal space-y-1">
                  <li>
                    If an older icon opens inside Chrome, <strong>remove that old Home Screen icon first</strong>.
                  </li>
                  <li>
                    Open this site in <strong>Google Chrome</strong>, tap <strong>⋮</strong> (top right) → <strong>Add to home screen</strong>.
                  </li>
                  <li>
                    Choose <strong>Install</strong> (NOT &ldquo;Create shortcut&rdquo;) — Chrome installs KeyNest as a standalone app without an address bar.
                  </li>
                </ol>
              </div>

              <div
                className={`rounded-xl border p-3.5 ${
                  platform === 'ios'
                    ? 'border-teal-300 bg-teal-50/60 dark:border-teal-500/35 dark:bg-teal-500/10'
                    : 'border-slate-200 bg-slate-50 dark:border-[#273342] dark:bg-[#0F141A]'
                }`}
              >
                <p className="mb-1 flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                  <Share2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                  iPhone / iPad (Safari)
                </p>
                <ol className="list-inside list-decimal space-y-1">
                  <li>
                    Open this HTTPS URL in <strong>Safari</strong> (iOS requires Safari to install standalone web apps).
                  </li>
                  <li>
                    Tap the <strong>Share</strong> icon → scroll down → tap <strong>Add to Home Screen</strong> → <strong>Add</strong>.
                  </li>
                </ol>
              </div>

              {platform === 'desktop' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-[#273342] dark:bg-[#0F141A]">
                  <p className="mb-1 font-bold text-slate-900 dark:text-white">
                    Windows / macOS (Chrome / Edge)
                  </p>
                  <p>
                    Click the <strong>Install</strong> icon in the address bar or browser menu → <strong>Install KeyNest</strong>.
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-4 w-full rounded-xl border border-slate-300 bg-slate-50 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-[#2C3A4B] dark:bg-[#1E2733] dark:text-slate-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

