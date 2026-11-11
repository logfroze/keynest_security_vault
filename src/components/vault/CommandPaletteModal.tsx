'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyRound,
  Lock,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { searchAndFilterItems } from '@/modules/search/searchEngine';
import { getPrimaryIdentifier } from '@/modules/vault/schemas';
import type { DecryptedVaultItem } from '@/types/vault';
import { ServiceMonogram } from '../ui/CategoryIcon';

interface CommandPaletteModalProps {
  items: DecryptedVaultItem[];
  onSelectItem: (item: DecryptedVaultItem) => void;
  onNewEntry: () => void;
  onOpenGenerator: () => void;
  onOpenAi: () => void;
  onLockVault: () => void;
  onClose: () => void;
}

export function CommandPaletteModal({
  items,
  onSelectItem,
  onNewEntry,
  onOpenGenerator,
  onOpenAi,
  onLockVault,
  onClose,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const matches = useMemo(
    () =>
      searchAndFilterItems(items, {
        search: query,
        category: 'all',
        sort: 'updated_desc',
      }).slice(0, 8),
    [items, query],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 px-4 pt-20 backdrop-blur-xs dark:bg-black/75"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-[#24303F] dark:bg-[#161D26]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3.5 dark:border-[#24303F]">
          <Search className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search decrypted vault items, emails, URLs, tags..."
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none dark:text-white"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          <div className="mb-2 px-2 pt-1">
            <p className="mb-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Quick Commands
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNewEntry();
                }}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:border-teal-400 dark:border-[#273342] dark:bg-[#0F141A] dark:text-slate-200"
              >
                <Plus className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" /> New Vault Entry
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenGenerator();
                }}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:border-teal-400 dark:border-[#273342] dark:bg-[#0F141A] dark:text-slate-200"
              >
                <KeyRound className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" /> Password Generator
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAi();
                }}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:border-teal-400 dark:border-[#273342] dark:bg-[#0F141A] dark:text-slate-200"
              >
                <Sparkles className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" /> Ask KeyNest Copilot
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLockVault();
                }}
                className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:border-amber-400 dark:border-amber-500/30 dark:bg-[#0F141A] dark:text-amber-300"
              >
                <Lock className="h-3.5 w-3.5" /> Lock Vault Now
              </button>
            </div>
          </div>

          <div className="px-2 pt-2">
            <p className="mb-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Vault Items ({matches.length})
            </p>
            {matches.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                No unlocked items match &ldquo;{query}&rdquo;.
              </p>
            ) : (
              <div className="space-y-1">
                {matches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectItem(item);
                      onClose();
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-[#1E2733]"
                  >
                    <div className="flex items-center gap-3">
                      <ServiceMonogram title={item.payload.title} size="sm" />
                      <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          {item.payload.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {getPrimaryIdentifier(item.payload)}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-[#0F141A] dark:text-slate-300">
                      {item.payload.category.replace('_', ' ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
