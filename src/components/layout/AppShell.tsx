'use client';

import React, { useEffect, useState } from 'react';
import {
  Home,
  KeyRound,
  Lock,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Timer,
  Vault,
  X,
} from 'lucide-react';
import type { CopilotUiAction } from '@/modules/ai/copilotEngine';
import type { DecryptedVaultItem, VaultCategory } from '@/types/vault';
import { AiCopilotDrawer } from '../ai/AiCopilotDrawer';
import { VaultAiWorkspace } from '../ai/VaultAiWorkspace';
import { ItemEditorModal } from '../forms/ItemEditorModal';
import { useTheme } from '../providers/ThemeProvider';
import { useVault } from '../providers/VaultProvider';
import { InstallAppButton } from '../pwa/InstallAppButton';
import { ConflictResolutionModal } from '../security/ConflictResolutionModal';
import { PasswordGeneratorModal } from '../security/PasswordGeneratorModal';
import { SecurityCenterModal } from '../security/SecurityCenterModal';
import { SettingsView } from '../settings/SettingsView';
import { CommandPaletteModal } from '../vault/CommandPaletteModal';
import { HomeOverview } from '../vault/HomeOverview';
import { VaultWorkspace } from '../vault/VaultWorkspace';

type ActiveTab = 'home' | 'vault' | 'ai' | 'settings';
type VaultFilter = VaultCategory | 'all' | 'favorites' | 'recent' | 'trash';

export function AppShell({ initialTab = 'home' }: { initialTab?: ActiveTab }) {
  const { theme, setTheme, toggleTheme } = useTheme();
  const {
    backendMode,
    profile,
    items,
    conflicts,
    clipboardCountdown,
    toasts,
    dismissToast,
    lockVault,
    createItem,
    updateItem,
    copySecret,
    resolveConflict,
    notify,
  } = useVault();

  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [vaultFilter, setVaultFilter] = useState<VaultFilter>('all');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [editorState, setEditorState] = useState<{
    open: boolean;
    item?: DecryptedVaultItem | null;
    defaultCategory?: VaultCategory;
  }>({ open: false });

  const [showGenerator, setShowGenerator] = useState(false);
  const [showSecurityCenter, setShowSecurityCenter] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  const [copilotOpen, setCopilotOpen] = useState(false);
  const [queuedCopilotPrompt, setQueuedCopilotPrompt] = useState('');

  const [aiInitialTab, setAiInitialTab] = useState<'assistant' | 'import'>('assistant');
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string>('');
  const [cloudApiKey, setCloudApiKey] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleOpenItem = (item: DecryptedVaultItem) => {
    setActiveTab('vault');
    setVaultFilter(item.deletedAt ? 'trash' : 'all');
    setSelectedItemId(item.id);
  };

  const handleExecuteCopilotUiAction = (action: CopilotUiAction) => {
    if (action.type === 'set_theme') {
      setTheme(action.theme);
      notify(`Switched to ${action.theme} theme.`, 'teal');
    } else if (action.type === 'navigate') {
      setActiveTab(action.tab);
      if (action.vaultFilter) setVaultFilter(action.vaultFilter);
    } else if (action.type === 'open_modal') {
      if (action.modal === 'generator') setShowGenerator(true);
      else if (action.modal === 'security_center') setShowSecurityCenter(true);
      else if (action.modal === 'new_entry')
        setEditorState({ open: true, defaultCategory: 'login' });
    } else if (action.type === 'lock_vault') {
      lockVault();
    }
  };

  const handleSaveEditor = async (payload: DecryptedVaultItem['payload']) => {
    if (editorState.item) {
      const updated = await updateItem(editorState.item, payload);
      setSelectedItemId(updated.id);
      notify(`Updated "${updated.payload.title}" and encrypted locally.`, 'teal');
    } else {
      const created = await createItem(payload);
      setSelectedItemId(created.id);
      setActiveTab('vault');
      notify(`Encrypted and saved "${created.payload.title}".`, 'teal');
    }
  };

  const navItems: Array<{ id: ActiveTab; label: string; icon: React.ElementType }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'vault', label: 'Vault', icon: Vault },
    { id: 'ai', label: 'Import & AI', icon: Sparkles },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div
      className={`flex min-h-screen flex-col bg-[#F4F7FA] pb-16 transition-[padding] duration-200 sm:pb-0 dark:bg-[#0F141A] ${
        copilotOpen ? 'lg:pr-[390px] xl:pr-[420px]' : ''
      }`}
    >
      {/* Top Bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm sm:px-6 dark:border-[#24303F] dark:bg-[#131921]/95">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-2.5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white shadow-xs dark:bg-teal-600/25 dark:text-teal-400 dark:ring-1 dark:ring-teal-500/40">
              <KeyRound className="h-4.5 w-4.5" />
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
              KeyNest
            </span>
          </button>

          <span className="hidden rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 md:inline-flex dark:border-[#2A3646] dark:bg-[#1B232E] dark:text-slate-300">
            {backendMode === 'supabase' ? 'Supabase Sync' : 'Local ZK Vault'}
          </span>
        </div>

        {/* Desktop Nav Tabs */}
        <nav className="hidden items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 sm:flex dark:border-[#24303F] dark:bg-[#0F141A]">
          {navItems.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition ${
                  active
                    ? 'bg-white text-teal-700 shadow-xs ring-1 ring-slate-200 dark:bg-teal-600/20 dark:text-teal-300 dark:ring-teal-500/35'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {clipboardCountdown !== null && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 tabular-nums text-xs font-medium text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/15 dark:text-teal-300">
              <Timer className="h-3.5 w-3.5" /> {clipboardCountdown}s
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowCommandPalette(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-700 transition hover:border-teal-400 hover:text-slate-900 dark:border-[#2A3646] dark:bg-[#18202B] dark:text-slate-200 dark:hover:border-teal-500/40"
            title="Search & Commands (Ctrl+K)"
          >
            <Search className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span className="hidden md:inline">Search</span>
            <kbd className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 md:inline dark:bg-[#0F141A] dark:text-slate-400">
              Ctrl+K
            </kbd>
          </button>

          {/* Theme Switcher */}
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-teal-400 hover:text-slate-900 dark:border-[#2A3646] dark:bg-[#18202B] dark:text-slate-300 dark:hover:text-white"
            title={theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
            aria-label="Toggle Light/Dark Theme"
          >
            {theme === 'light' ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4 text-amber-400" />
            )}
          </button>

          <InstallAppButton variant="header" />

          {/* Side-by-Side AI Copilot Button (BK Packages style!) */}
          <button
            type="button"
            onClick={() => setCopilotOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-semibold transition ${
              copilotOpen
                ? 'bg-teal-600 text-white shadow-xs'
                : 'border border-teal-500/40 bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-500/15 dark:text-teal-300 dark:hover:bg-teal-500/25'
            }`}
            title="Open Side-by-Side AI Copilot"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Ask AI</span>
          </button>

          <button
            type="button"
            onClick={lockVault}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-[13px] font-medium text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25"
            title="Lock Vault and wipe in-memory keys"
          >
            <Lock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Lock</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1">
        {activeTab === 'home' && (
          <HomeOverview
            onOpenVaultCategory={(cat) => {
              setVaultFilter(cat);
              setActiveTab('vault');
            }}
            onSelectItem={handleOpenItem}
            onAskAi={(prompt) => {
              if (prompt === '__open_import__') {
                setAiInitialTab('import');
                setPendingAiPrompt(prompt);
                setActiveTab('ai');
              } else {
                setQueuedCopilotPrompt(prompt);
                setCopilotOpen(true);
              }
            }}
            onNewEntry={() => setEditorState({ open: true, defaultCategory: 'login' })}
          />
        )}

        {activeTab === 'vault' && (
          <VaultWorkspace
            activeFilter={vaultFilter}
            onChangeFilter={setVaultFilter}
            selectedItemId={selectedItemId}
            onSelectItem={(item) => setSelectedItemId(item?.id ?? null)}
            onNewEntry={(defaultCat) =>
              setEditorState({ open: true, defaultCategory: defaultCat ?? 'login' })
            }
            onEditItem={(item) => setEditorState({ open: true, item })}
            onOpenGenerator={() => setShowGenerator(true)}
            onOpenSecurityCenter={() => setShowSecurityCenter(true)}
            onOpenAiImport={() => {
              setAiInitialTab('import');
              setPendingAiPrompt('__open_import__');
              setActiveTab('ai');
            }}
            onOpenSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'ai' && (
          <VaultAiWorkspace
            initialTab={aiInitialTab}
            initialPrompt={pendingAiPrompt}
            cloudApiKey={cloudApiKey}
            onClearInitialPrompt={() => setPendingAiPrompt('')}
            onSelectItem={handleOpenItem}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            cloudApiKey={cloudApiKey}
            onChangeCloudApiKey={setCloudApiKey}
          />
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed right-0 bottom-0 left-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white/95 py-1.5 backdrop-blur-sm sm:hidden dark:border-[#24303F] dark:bg-[#131921]/95">
        {navItems.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-0.5 py-1 text-[11px] ${
                active
                  ? 'font-semibold text-teal-600 dark:text-teal-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Side-by-Side AI Copilot Drawer */}
      <AiCopilotDrawer
        open={copilotOpen}
        activeTab={activeTab}
        cloudApiKey={cloudApiKey}
        queuedPrompt={queuedCopilotPrompt}
        onClearQueuedPrompt={() => setQueuedCopilotPrompt('')}
        onClose={() => setCopilotOpen(false)}
        onSelectItem={handleOpenItem}
        onExecuteUiAction={handleExecuteCopilotUiAction}
      />

      {/* Modals */}
      {editorState.open && (
        <ItemEditorModal
          initialItem={editorState.item}
          initialCategory={editorState.defaultCategory}
          paymentEnabled={profile?.preferences.enablePaymentCategory ?? false}
          onSave={handleSaveEditor}
          onClose={() => setEditorState({ open: false })}
        />
      )}

      {showGenerator && (
        <PasswordGeneratorModal
          onCopy={(pw) => copySecret(pw, 'Generated password')}
          onClose={() => setShowGenerator(false)}
        />
      )}

      {showSecurityCenter && (
        <SecurityCenterModal
          items={items}
          onSelectItem={handleOpenItem}
          onClose={() => setShowSecurityCenter(false)}
        />
      )}

      {showCommandPalette && (
        <CommandPaletteModal
          items={items}
          onSelectItem={handleOpenItem}
          onNewEntry={() => setEditorState({ open: true, defaultCategory: 'login' })}
          onOpenGenerator={() => setShowGenerator(true)}
          onOpenAi={() => setCopilotOpen(true)}
          onLockVault={lockVault}
          onClose={() => setShowCommandPalette(false)}
        />
      )}

      {conflicts.length > 0 && (
        <ConflictResolutionModal
          conflict={conflicts[0]}
          onResolve={resolveConflict}
        />
      )}

      {/* Toasts */}
      <div className="fixed right-4 bottom-20 z-50 flex flex-col gap-2 sm:bottom-5">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-medium shadow-lg ${
              t.tone === 'danger'
                ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-[#231417] dark:text-red-200'
                : t.tone === 'warning'
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-[#231C11] dark:text-amber-200'
                  : 'border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-500/40 dark:bg-[#112122] dark:text-teal-100'
            }`}
          >
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="opacity-70 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
