'use client';

import React, { useMemo, useState } from 'react';
import {
  Clock,
  Copy,
  CreditCard,
  FolderOpen,
  KeyRound,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  analyzeVaultSecurityHealth,
  extractAllTags,
  searchAndFilterItems,
  type VaultSortOption,
} from '@/modules/search/searchEngine';
import { formatRelativeTime } from '@/modules/security/securityUtils';
import {
  CATEGORY_DEFINITIONS,
  getItemStrength,
  getPrimaryIdentifier,
  getPrimarySecret,
  getPrimaryUrl,
  VAULT_CATEGORY_ORDER,
} from '@/modules/vault/schemas';
import type { DecryptedVaultItem, VaultCategory } from '@/types/vault';
import { useVault } from '../providers/VaultProvider';
import { CategoryIcon, ServiceMonogram } from '../ui/CategoryIcon';
import { VaultInspector } from './VaultInspector';

type SidebarFilter = VaultCategory | 'all' | 'favorites' | 'recent' | 'trash';

export function VaultWorkspace({
  activeFilter,
  onChangeFilter,
  selectedItemId,
  onSelectItem,
  onNewEntry,
  onEditItem,
  onOpenGenerator,
  onOpenSecurityCenter,
  onOpenAiImport,
  onOpenSettings,
}: {
  activeFilter: SidebarFilter;
  onChangeFilter: (f: SidebarFilter) => void;
  selectedItemId: string | null;
  onSelectItem: (item: DecryptedVaultItem | null) => void;
  onNewEntry: (defaultCat?: VaultCategory) => void;
  onEditItem: (item: DecryptedVaultItem) => void;
  onOpenGenerator: () => void;
  onOpenSecurityCenter: () => void;
  onOpenAiImport: () => void;
  onOpenSettings: () => void;
}) {
  const { items, profile, hasPasskeyEnvelope, updatePreferences, updateItem, copySecret, notify } =
    useVault();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sort, setSort] = useState<VaultSortOption>('updated_desc');
  const [dismissedHints, setDismissedHints] = useState<Record<string, boolean>>({});

  const paymentEnabled = profile?.preferences.enablePaymentCategory ?? false;
  const activeCount = useMemo(
    () => items.filter((i) => i.deletedAt === null).length,
    [items],
  );
  const favCount = useMemo(
    () => items.filter((i) => i.deletedAt === null && i.payload.favorite).length,
    [items],
  );
  const trashCount = useMemo(
    () => items.filter((i) => i.deletedAt !== null).length,
    [items],
  );
  const categoryCounts = useMemo(() => {
    const counts: Record<VaultCategory, number> = {
      login: 0,
      developer_secret: 0,
      financial: 0,
      personal: 0,
      payment: 0,
      secure_note: 0,
      custom: 0,
    };
    for (const item of items) {
      if (item.deletedAt === null) {
        counts[item.payload.category] = (counts[item.payload.category] ?? 0) + 1;
      }
    }
    return counts;
  }, [items]);

  const tags = useMemo(() => extractAllTags(items), [items]);
  const health = useMemo(() => analyzeVaultSecurityHealth(items), [items]);

  const filteredItems = useMemo(
    () =>
      searchAndFilterItems(items, {
        search: searchQuery,
        category: activeFilter,
        tag: selectedTag,
        sort,
      }),
    [items, searchQuery, activeFilter, selectedTag, sort],
  );

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const headingLabel = useMemo(() => {
    if (selectedTag) return `Tag: ${selectedTag}`;
    if (activeFilter === 'all') return 'All Entries';
    if (activeFilter === 'favorites') return 'Favorites';
    if (activeFilter === 'recent') return 'Recent';
    if (activeFilter === 'trash') return 'Trash';
    return CATEGORY_DEFINITIONS[activeFilter].label;
  }, [activeFilter, selectedTag]);

  const handleEnablePayments = async () => {
    await updatePreferences({ enablePaymentCategory: true });
    notify('Cards & Payment category enabled with sensitive reveal confirmation.', 'teal');
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden lg:flex-row">
      {/* Left Sidebar */}
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:w-64 lg:border-r lg:border-b-0 dark:border-[#24303F] dark:bg-[#131921]">
        <div className="flex-1 space-y-5 overflow-y-auto p-3.5">
          {/* Primary Views */}
          <div className="space-y-1">
            {[
              { id: 'all' as const, label: 'All Entries', icon: FolderOpen, count: activeCount },
              { id: 'favorites' as const, label: 'Favorites', icon: Star, count: favCount },
              { id: 'recent' as const, label: 'Recent (7d)', icon: Clock, count: null },
            ].map((nav) => {
              const Icon = nav.icon;
              const isSelected = activeFilter === nav.id && !selectedTag;
              return (
                <button
                  key={nav.id}
                  type="button"
                  onClick={() => {
                    onChangeFilter(nav.id);
                    setSelectedTag(null);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium transition ${
                    isSelected
                      ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-600/20 dark:text-teal-300 dark:ring-teal-500/35'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1C2530] dark:hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    {nav.label}
                  </span>
                  {nav.count !== null && (
                    <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400">
                      {nav.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Categories */}
          <div>
            <p className="mb-1.5 px-3 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Categories
            </p>
            <div className="space-y-0.5">
              {VAULT_CATEGORY_ORDER.map((cat) => {
                const isSelected = activeFilter === cat && !selectedTag;
                const count = categoryCounts[cat] ?? 0;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      onChangeFilter(cat);
                      setSelectedTag(null);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] transition ${
                      isSelected
                        ? 'bg-teal-50 font-semibold text-teal-700 ring-1 ring-teal-200 dark:bg-teal-600/20 dark:text-teal-300 dark:ring-teal-500/35'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1C2530] dark:hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <CategoryIcon category={cat} className="h-4 w-4" />
                      {CATEGORY_DEFINITIONS[cat].shortLabel}
                    </span>
                    <span className="tabular-nums text-xs text-slate-400">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <p className="mb-1.5 px-3 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                Tags
              </p>
              <div className="space-y-0.5">
                {tags.slice(0, 8).map((entry) => {
                  const isSelected = selectedTag === entry.tag;
                  return (
                    <button
                      key={entry.tag}
                      type="button"
                      onClick={() => setSelectedTag(isSelected ? null : entry.tag)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-[13px] transition ${
                        isSelected
                          ? 'bg-teal-50 font-medium text-teal-700 dark:bg-teal-600/20 dark:text-teal-300'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#1C2530]'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Tag className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{entry.tag}</span>
                      </span>
                      <span className="tabular-nums text-xs text-slate-400">
                        {entry.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tools */}
          <div>
            <p className="mb-1.5 px-3 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Tools
            </p>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={onOpenSecurityCenter}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1C2530] dark:hover:text-white"
              >
                <span className="flex items-center gap-2.5">
                  <ShieldAlert className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Security Center
                </span>
                <span className="tabular-nums text-xs font-semibold text-teal-600 dark:text-teal-400">
                  {health.healthScore}%
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenGenerator}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1C2530] dark:hover:text-white"
              >
                <KeyRound className="h-4 w-4 text-amber-500" />
                Password Generator
              </button>

              <button
                type="button"
                onClick={() => {
                  onChangeFilter('trash');
                  setSelectedTag(null);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] ${
                  activeFilter === 'trash'
                    ? 'bg-red-50 font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1C2530] dark:hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Trash2 className="h-4 w-4" />
                  Trash
                </span>
                <span className="tabular-nums text-xs text-slate-400">
                  {trashCount}
                </span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Center Table / Rows */}
      <main className="flex min-w-0 flex-1 flex-col bg-[#F4F7FA] dark:bg-[#0F141A]">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 bg-white px-4 py-3 sm:px-5 dark:border-[#24303F] dark:bg-[#131921]">
          <button
            type="button"
            onClick={() =>
              onNewEntry(
                activeFilter !== 'all' &&
                  activeFilter !== 'favorites' &&
                  activeFilter !== 'recent' &&
                  activeFilter !== 'trash'
                  ? activeFilter
                  : 'login',
              )
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-teal-500"
          >
            <Plus className="h-4 w-4" /> New Entry
          </button>

          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entries, emails, URLs, tags..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 dark:border-[#2A3748] dark:bg-[#0F141A] dark:text-white dark:placeholder-slate-400"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as VaultSortOption)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-teal-500 dark:border-[#2A3748] dark:bg-[#0F141A] dark:text-slate-200"
          >
            <option value="updated_desc">Last Updated</option>
            <option value="name_asc">Name (A-Z)</option>
            <option value="strength_asc">Weakest First</option>
          </select>

          <button
            type="button"
            onClick={onOpenAiImport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-teal-700 hover:border-teal-400 dark:border-[#2A3748] dark:bg-[#1C2530] dark:text-teal-300"
          >
            <Sparkles className="h-4 w-4" /> AI Import
          </button>
        </div>

        {/* Payment Opt-in Banner */}
        {activeFilter === 'payment' && !paymentEnabled && (
          <div className="m-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-500/35 dark:bg-amber-500/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="font-semibold text-amber-900 dark:text-amber-200">
                    Cards &amp; Payment Storage is Disabled by Default
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800 dark:text-slate-300">
                    Per KeyNest security guidelines, storing full card numbers/CVVs requires explicit opt-in and extra confirmation before reveal or copy.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleEnablePayments}
                className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                Enable Payment Cards
              </button>
            </div>
          </div>
        )}

        {/* Heading + List */}
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {headingLabel}
            </h1>
            <span className="tabular-nums text-xs font-medium text-slate-500 dark:text-slate-400">
              {filteredItems.length} item{filteredItems.length === 1 ? '' : 's'}
            </span>
          </div>

          {activeFilter === 'all' &&
            (!hasPasskeyEnvelope || health.weakItemIds.length > 0) &&
            (!dismissedHints.passkey || !dismissedHints.health) && (
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                {!hasPasskeyEnvelope && !dismissedHints.passkey && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="text-left"
                    >
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Add Passkey Unlock
                      </p>
                      <span className="mt-1 inline-block rounded bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                        Efficiency
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDismissedHints((p) => ({ ...p, passkey: true }))
                      }
                      className="text-base text-slate-400 hover:text-slate-700 dark:hover:text-white"
                    >
                      ×
                    </button>
                  </div>
                )}

                {health.weakItemIds.length > 0 && !dismissedHints.health && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
                    <button
                      type="button"
                      onClick={onOpenSecurityCenter}
                      className="text-left"
                    >
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Review {health.weakItemIds.length} weak password
                        {health.weakItemIds.length === 1 ? '' : 's'}
                      </p>
                      <span className="mt-1 inline-block rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        Security
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDismissedHints((p) => ({ ...p, health: true }))
                      }
                      className="text-base text-slate-400 hover:text-slate-700 dark:hover:text-white"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            )}

          {filteredItems.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-[#2D3B4D] dark:bg-[#131922]">
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
                No entries in {headingLabel}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {searchQuery
                  ? 'Try adjusting your search keywords or clearing filters.'
                  : 'Create an entry or import credentials with Vault AI.'}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
              <div className="hidden grid-cols-12 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase md:grid dark:border-[#24303F] dark:bg-[#131921] dark:text-slate-400">
                <div className="col-span-5">Name</div>
                <div className="col-span-3">Endpoint / URL</div>
                <div className="col-span-2">Tags / Health</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-[#212C3A]">
                {filteredItems.map((item) => {
                  const isSelected = selectedItem?.id === item.id;
                  const identifier = getPrimaryIdentifier(item.payload);
                  const url = getPrimaryUrl(item.payload);
                  const strength = getItemStrength(item);
                  const quickSecret = getPrimarySecret(item.payload);

                  return (
                    <div
                      key={item.id}
                      onClick={() => onSelectItem(item)}
                      className={`grid cursor-pointer grid-cols-12 items-center gap-2 px-4 py-3.5 transition ${
                        isSelected
                          ? 'bg-teal-50 dark:bg-teal-500/15'
                          : 'hover:bg-slate-50 dark:hover:bg-[#1B2430]'
                      }`}
                    >
                      <div className="col-span-8 flex min-w-0 items-center gap-3 md:col-span-5">
                        <ServiceMonogram title={item.payload.title} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {item.payload.title}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {identifier}
                          </p>
                        </div>
                      </div>

                      <div className="hidden min-w-0 truncate text-xs text-slate-600 md:col-span-3 md:block dark:text-slate-300">
                        {url || CATEGORY_DEFINITIONS[item.payload.category].shortLabel}
                      </div>

                      <div className="hidden items-center gap-2 md:col-span-2 md:flex">
                        {strength && (
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${
                              strength.score >= 3
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : strength.score === 2
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            ● {strength.label}
                          </span>
                        )}
                        {!strength && item.payload.tags[0] && (
                          <span className="truncate rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-[#0F141A] dark:text-slate-300">
                            {item.payload.tags[0]}
                          </span>
                        )}
                      </div>

                      <div
                        className="col-span-4 flex items-center justify-end gap-1.5 md:col-span-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="hidden text-xs text-slate-400 xl:inline">
                          {formatRelativeTime(item.updatedAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateItem(item, {
                              ...item.payload,
                              favorite: !item.payload.favorite,
                            })
                          }
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-[#232E3C]"
                          title="Favorite"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              item.payload.favorite
                                ? 'fill-amber-400 text-amber-400'
                                : ''
                            }`}
                          />
                        </button>
                        {quickSecret && (
                          <button
                            type="button"
                            onClick={() =>
                              copySecret(quickSecret, `${item.payload.title} secret`)
                            }
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-600 dark:text-slate-300 dark:hover:bg-[#232E3C] dark:hover:text-teal-400"
                            title="Quick Copy Secret"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Right Inspector Panel */}
      {selectedItem && (
        <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-slate-200 bg-white shadow-2xl lg:static lg:z-0 lg:w-96 lg:shadow-none dark:border-[#24303F] dark:bg-[#161D26]">
          <VaultInspector
            item={selectedItem}
            onEdit={onEditItem}
            onClose={() => onSelectItem(null)}
          />
        </aside>
      )}
    </div>
  );
}
