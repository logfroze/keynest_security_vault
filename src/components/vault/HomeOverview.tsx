'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Code2,
  CreditCard,
  FileLock2,
  Globe,
  Landmark,
  Plus,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { formatRelativeTime } from '@/modules/security/securityUtils';
import { getPrimaryIdentifier } from '@/modules/vault/schemas';
import type { DecryptedVaultItem, VaultCategory, VaultItemPayload } from '@/types/vault';
import { useVault } from '../providers/VaultProvider';
import { ServiceMonogram } from '../ui/CategoryIcon';

function padTwo(n: number): string {
  return String(n).padStart(2, '0');
}

const SAMPLE_DEMO_PAYLOADS: VaultItemPayload[] = [
  {
    title: 'GitHub',
    category: 'developer_secret',
    fields: {
      service: 'GitHub',
      environment: 'production',
      username: 'logfrozeofficial',
      email: 'logfroze@gmail.com',
      apiKey: 'ghp_exampleDemoToken9876543210KeyNest',
      secretKey: '',
      endpoint: 'https://api.github.com',
    },
    customFields: [],
    tags: ['Work', 'Dev'],
    notes: 'Personal GitHub developer token (sample demo item).',
    favorite: true,
    passwordHistory: [],
  },
  {
    title: 'Facebook',
    category: 'login',
    fields: {
      website: 'facebook.com',
      username: 'logfroze',
      email: 'logfroze@gmail.com',
      password: 'Demo!StrongPassword#2026',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      url: 'https://facebook.com',
    },
    customFields: [],
    tags: ['Social'],
    notes: 'Primary social login (sample demo item).',
    favorite: false,
    passwordHistory: [],
  },
  {
    title: 'Bank Alfalah',
    category: 'financial',
    fields: {
      bankName: 'Bank Alfalah',
      accountTitle: 'Muhammad Umar',
      iban: 'PK36ALFH0000001001234567',
      accountNumber: '1001234567',
      routingCode: 'ALFHPKKA',
      walletDetails: 'Main Personal Account',
    },
    customFields: [],
    tags: ['Finance'],
    notes: 'Sample banking entry with extra reveal confirmation.',
    favorite: true,
    passwordHistory: [],
  },
  {
    title: 'Emergency Hosting Recovery',
    category: 'secure_note',
    fields: {
      content: 'Primary cloud DNS backup code: KN-DEMO-7741-9920\nRegistrar PIN: 492018',
    },
    customFields: [],
    tags: ['Backup'],
    notes: '',
    favorite: false,
    passwordHistory: [],
  },
];

export function HomeOverview({
  onOpenVaultCategory,
  onSelectItem,
  onAskAi,
  onNewEntry,
}: {
  onOpenVaultCategory: (cat: VaultCategory | 'all') => void;
  onSelectItem: (item: DecryptedVaultItem) => void;
  onAskAi: (prompt: string) => void;
  onNewEntry: () => void;
}) {
  const { backendMode, items, bulkCreateItems, copySecret, notify } = useVault();
  const [aiPrompt, setAiPrompt] = useState('');
  const [seeding, setSeeding] = useState(false);

  const activeItems = useMemo(
    () => items.filter((item) => item.deletedAt === null),
    [items],
  );

  const counts = useMemo(() => {
    const map: Record<VaultCategory, number> = {
      login: 0,
      developer_secret: 0,
      financial: 0,
      personal: 0,
      payment: 0,
      secure_note: 0,
      custom: 0,
    };
    for (const item of activeItems) {
      map[item.payload.category] = (map[item.payload.category] ?? 0) + 1;
    }
    return map;
  }, [activeItems]);

  const recentItems = useMemo(
    () =>
      [...activeItems]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 4),
    [activeItems],
  );

  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAskAi(aiPrompt.trim());
    setAiPrompt('');
  };

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      await bulkCreateItems(SAMPLE_DEMO_PAYLOADS);
      notify('Added 4 encrypted sample entries to your vault.', 'teal');
    } finally {
      setSeeding(false);
    }
  };

  const primaryCards: Array<{
    cat: VaultCategory;
    label: string;
    count: number;
    icon: React.ReactNode;
  }> = [
    {
      cat: 'login',
      label: 'Logins',
      count: counts.login,
      icon: <Globe className="h-5 w-5 text-teal-600 dark:text-teal-400" />,
    },
    {
      cat: 'developer_secret',
      label: 'Developer',
      count: counts.developer_secret,
      icon: <Code2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />,
    },
    {
      cat: 'financial',
      label: 'Financial',
      count: counts.financial,
      icon: <Landmark className="h-5 w-5 text-teal-600 dark:text-teal-400" />,
    },
    {
      cat: 'secure_note',
      label: 'Secure notes',
      count: counts.secure_note,
      icon: <FileLock2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      {/* Hero Status Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase dark:text-slate-400">
              YOUR PERSONAL VAULT
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              Welcome back.
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Your information, securely organized.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/30">
                <ShieldCheck className="h-3.5 w-3.5" />
                Vault unlocked
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {backendMode === 'supabase'
                  ? 'Encrypted synchronization active'
                  : 'Local zero-knowledge encrypted storage active'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={onNewEntry}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-teal-500"
            >
              <Plus className="h-4 w-4" /> New Entry
            </button>
            <button
              type="button"
              onClick={() => onOpenVaultCategory('all')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-teal-400 hover:text-slate-900 dark:border-[#2C3A4B] dark:bg-[#1E2733] dark:text-slate-200 dark:hover:text-white"
            >
              Browse Vault <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2x2 Primary Category Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {primaryCards.map((card) => (
          <button
            key={card.cat}
            type="button"
            onClick={() => onOpenVaultCategory(card.cat)}
            className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs transition hover:border-teal-400 hover:shadow-sm dark:border-[#24303F] dark:bg-[#161D26] dark:hover:border-teal-500/50"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-500/15">
                {card.icon}
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-teal-600 dark:text-slate-500 dark:group-hover:text-teal-400" />
            </div>
            <p className="tabular-nums text-3xl font-bold text-slate-900 dark:text-white">
              {padTwo(card.count)}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              {card.label}
            </p>
          </button>
        ))}
      </div>

      {/* Compact Secondary Categories Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => onOpenVaultCategory('personal')}
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-xs transition hover:border-teal-400 dark:border-[#24303F] dark:bg-[#161D26] dark:hover:border-teal-500/50"
        >
          <div className="flex items-center gap-2.5">
            <User className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Personal Info
            </span>
          </div>
          <span className="tabular-nums text-sm font-semibold text-slate-500 dark:text-slate-400">
            {padTwo(counts.personal)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onOpenVaultCategory('payment')}
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-xs transition hover:border-teal-400 dark:border-[#24303F] dark:bg-[#161D26] dark:hover:border-teal-500/50"
        >
          <div className="flex items-center gap-2.5">
            <CreditCard className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Cards &amp; Payment
            </span>
          </div>
          <span className="tabular-nums text-sm font-semibold text-slate-500 dark:text-slate-400">
            {padTwo(counts.payment)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onOpenVaultCategory('all')}
          className="col-span-2 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-xs transition hover:border-teal-400 sm:col-span-1 dark:border-[#24303F] dark:bg-[#161D26] dark:hover:border-teal-500/50"
        >
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
            All Encrypted Records
          </span>
          <span className="tabular-nums text-sm font-bold text-teal-600 dark:text-teal-400">
            {padTwo(activeItems.length)}
          </span>
        </button>
      </div>

      {/* Ask KeyNest AI Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Ask KeyNest Copilot
            </h2>
          </div>
          <span className="rounded-full bg-teal-50 px-3 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
            Side-by-Side · Zero-Knowledge
          </span>
        </div>

        <form onSubmit={handleAiSubmit} className="flex flex-col gap-2.5 sm:flex-row">
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Ask anything (e.g., Find my hosting credentials, Add a Notion login, Switch to dark mode...)"
            className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white dark:placeholder-slate-400"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-500"
          >
            Ask AI <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* Empty Vault Quick Starter OR Recent Items */}
      {activeItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center dark:border-[#2D3B4D] dark:bg-[#131922]">
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            Your vault is ready and empty.
          </p>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
            Add your first secret manually, bulk import unstructured notes with Vault AI, or load 4 safe sample entries to test everything.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            <button
              type="button"
              onClick={onNewEntry}
              className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-500"
            >
              + Create First Record
            </button>
            <button
              type="button"
              onClick={() => onAskAi('__open_import__')}
              className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-[#2C3A4B] dark:bg-[#1C2530] dark:text-slate-200 dark:hover:text-white"
            >
              Bulk Import via Vault AI
            </button>
            <button
              type="button"
              disabled={seeding}
              onClick={handleSeedDemo}
              className="rounded-xl border border-teal-500/40 bg-teal-50 px-4 py-2.5 text-sm font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-50 dark:bg-teal-500/15 dark:text-teal-300 dark:hover:bg-teal-500/25"
            >
              {seeding ? 'Encrypting Samples...' : 'Load 4 Sample Entries'}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
              Recently Updated
            </h2>
            <button
              type="button"
              onClick={() => onOpenVaultCategory('all')}
              className="text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400"
            >
              View all →
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-[#212C3A]">
            {recentItems.map((item) => {
              const quickSecret =
                item.payload.fields.password ||
                item.payload.fields.apiKey ||
                item.payload.fields.secretKey;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <button
                    type="button"
                    onClick={() => onSelectItem(item)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <ServiceMonogram title={item.payload.title} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {item.payload.title}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {getPrimaryIdentifier(item.payload)}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="hidden text-xs text-slate-400 sm:inline">
                      {formatRelativeTime(item.updatedAt)}
                    </span>
                    {quickSecret && (
                      <button
                        type="button"
                        onClick={() => copySecret(quickSecret, item.payload.title)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-teal-400 hover:text-teal-700 dark:border-[#2A3748] dark:bg-[#1E2733] dark:text-slate-200 dark:hover:text-teal-300"
                      >
                        Copy
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
  );
}
