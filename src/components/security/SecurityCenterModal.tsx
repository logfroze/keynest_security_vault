'use client';

import React, { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CopyCheck,
  KeyRound,
  ShieldAlert,
  X,
} from 'lucide-react';
import { analyzeVaultSecurityHealth } from '@/modules/search/searchEngine';
import type { DecryptedVaultItem } from '@/types/vault';

export function SecurityCenterModal({
  items,
  onSelectItem,
  onClose,
}: {
  items: DecryptedVaultItem[];
  onSelectItem: (item: DecryptedVaultItem) => void;
  onClose: () => void;
}) {
  const health = useMemo(() => analyzeVaultSecurityHealth(items), [items]);
  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const weakItems = health.weakItemIds
    .map((id) => itemMap.get(id))
    .filter((x): x is DecryptedVaultItem => Boolean(x));
  const reusedItems = health.reusedItemIds
    .map((id) => itemMap.get(id))
    .filter((x): x is DecryptedVaultItem => Boolean(x));
  const missing2fa = health.missing2faLoginIds
    .map((id) => itemMap.get(id))
    .filter((x): x is DecryptedVaultItem => Boolean(x));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs dark:bg-black/75">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-[#24303F] dark:bg-[#161D26]">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-[#24303F]">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Security Health Center (Local Audit)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-[#273342] dark:bg-[#0F141A]">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Overall Vault Health Score
              </p>
              <p className="mt-1 tabular-nums text-3xl font-bold text-slate-900 dark:text-white">
                {health.healthScore}%
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Computed locally across {health.totalSecretsChecked} password-protected entries.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 dark:border-[#24303F] dark:bg-[#161D26]">
                <p className="tabular-nums text-lg font-bold text-red-600 dark:text-red-400">
                  {weakItems.length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Weak</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 dark:border-[#24303F] dark:bg-[#161D26]">
                <p className="tabular-nums text-lg font-bold text-amber-600 dark:text-amber-400">
                  {reusedItems.length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Reused</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 dark:border-[#24303F] dark:bg-[#161D26]">
                <p className="tabular-nums text-lg font-bold text-sky-600 dark:text-sky-400">
                  {missing2fa.length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">No 2FA</p>
              </div>
            </div>
          </div>

          {weakItems.length === 0 && reusedItems.length === 0 && missing2fa.length === 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
              <span>Your active vault credentials look strong with zero weak or reused passwords.</span>
            </div>
          )}

          {weakItems.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Weak Passwords ({weakItems.length})
              </h3>
              <div className="space-y-1.5">
                {weakItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectItem(item);
                      onClose();
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs hover:border-teal-400 dark:border-[#273342] dark:bg-[#0F141A]"
                  >
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {item.payload.title}
                    </span>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      Update Password →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {reusedItems.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-300">
                <CopyCheck className="h-3.5 w-3.5" /> Reused Passwords ({reusedItems.length})
              </h3>
              <div className="space-y-1.5">
                {reusedItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectItem(item);
                      onClose();
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs hover:border-teal-400 dark:border-[#273342] dark:bg-[#0F141A]"
                  >
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {item.payload.title}
                    </span>
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      Rotate Secret →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {missing2fa.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-sky-600 dark:text-sky-300">
                <KeyRound className="h-3.5 w-3.5" /> Logins Missing 2FA Secret ({missing2fa.length})
              </h3>
              <div className="space-y-1.5">
                {missing2fa.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectItem(item);
                      onClose();
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs hover:border-teal-400 dark:border-[#273342] dark:bg-[#0F141A]"
                  >
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {item.payload.title}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">Add TOTP →</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
