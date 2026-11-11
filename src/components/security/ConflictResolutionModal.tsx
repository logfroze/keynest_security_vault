'use client';

import React, { useState } from 'react';
import { GitMerge } from 'lucide-react';
import type { SyncConflict } from '@/types/vault';

export function ConflictResolutionModal({
  conflict,
  onResolve,
}: {
  conflict: SyncConflict;
  onResolve: (
    conflict: SyncConflict,
    resolution: 'keep_local' | 'keep_remote',
  ) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const pick = async (choice: 'keep_local' | 'keep_remote') => {
    setBusy(true);
    try {
      await onResolve(conflict, choice);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs dark:bg-black/80">
      <div className="w-full max-w-2xl rounded-2xl border border-amber-300 bg-white p-6 shadow-2xl dark:border-amber-500/40 dark:bg-[#161D26]">
        <div className="mb-3 flex items-center gap-2.5 text-amber-600 dark:text-amber-300">
          <GitMerge className="h-5 w-5" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Sync Conflict Detected — No Silent Overwrite
          </h2>
        </div>
        <p className="mb-5 text-xs text-slate-600 dark:text-slate-300">
          &ldquo;{conflict.localItem.payload.title}&rdquo; was modified concurrently on another device (server revision #{conflict.remoteEncrypted.revision}). Choose which encrypted copy to retain:
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#273342] dark:bg-[#0F141A]">
            <p className="mb-1 text-xs font-bold text-teal-700 dark:text-teal-400">
              This Device (Draft)
            </p>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Title: {conflict.localItem.payload.title}
            </p>
            <div className="mb-4 max-h-36 space-y-1 overflow-y-auto text-xs text-slate-700 dark:text-slate-200">
              {Object.entries(conflict.localItem.payload.fields).map(([k, v]) =>
                v ? (
                  <p key={k} className="truncate">
                    <span className="text-slate-500">{k}:</span>{' '}
                    {k.toLowerCase().includes('pass') || k.toLowerCase().includes('key')
                      ? '••••••••'
                      : v}
                  </p>
                ) : null,
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => pick('keep_local')}
              className="w-full rounded-xl bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
            >
              Keep This Device&apos;s Version
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#273342] dark:bg-[#0F141A]">
            <p className="mb-1 text-xs font-bold text-sky-700 dark:text-sky-400">
              Remote Version (Rev #{conflict.remoteEncrypted.revision})
            </p>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Updated: {new Date(conflict.remoteEncrypted.updatedAt).toLocaleString()}
            </p>
            <div className="mb-4 max-h-36 space-y-1 overflow-y-auto text-xs text-slate-700 dark:text-slate-200">
              {conflict.remoteDecrypted ? (
                Object.entries(conflict.remoteDecrypted.payload.fields).map(([k, v]) =>
                  v ? (
                    <p key={k} className="truncate">
                      <span className="text-slate-500">{k}:</span>{' '}
                      {k.toLowerCase().includes('pass') || k.toLowerCase().includes('key')
                        ? '••••••••'
                        : v}
                    </p>
                  ) : null,
                )
              ) : (
                <p className="text-slate-500">Encrypted payload</p>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => pick('keep_remote')}
              className="w-full rounded-xl border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-[#2C3A4B] dark:bg-[#1E2733] dark:text-slate-200"
            >
              Keep Remote Version
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
