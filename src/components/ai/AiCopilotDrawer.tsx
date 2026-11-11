'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Cloud,
  Copy,
  Edit3,
  ExternalLink,
  History,
  Lock,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  buildSafeCopilotSnapshot,
  parseGeminiCopilotResponse,
  processLocalCopilotTurn,
  type CopilotPendingAction,
  type CopilotReply,
  type CopilotUiAction,
} from '@/modules/ai/copilotEngine';
import { generateStrongPassword } from '@/modules/cryptography/password';
import { getPrimaryIdentifier, getPrimarySecret } from '@/modules/vault/schemas';
import { generateUuid } from '@/modules/vault/vaultManager';
import type {
  AiChatMessageRecord,
  AiConversationThread,
  DecryptedVaultItem,
} from '@/types/vault';
import { useTheme } from '../providers/ThemeProvider';
import { useVault } from '../providers/VaultProvider';
import { ServiceMonogram } from '../ui/CategoryIcon';

interface AiCopilotDrawerProps {
  open: boolean;
  activeTab: string;
  cloudApiKey: string;
  queuedPrompt?: string;
  onClearQueuedPrompt: () => void;
  onClose: () => void;
  onSelectItem: (item: DecryptedVaultItem) => void;
  onExecuteUiAction: (action: CopilotUiAction) => void;
}

export function AiCopilotDrawer({
  open,
  activeTab,
  cloudApiKey,
  queuedPrompt,
  onClearQueuedPrompt,
  onClose,
  onSelectItem,
  onExecuteUiAction,
}: AiCopilotDrawerProps) {
  const { theme } = useTheme();
  const {
    backendMode,
    user,
    profile,
    items,
    createItem,
    bulkCreateItems,
    updateItem,
    softDeleteItem,
    restoreItem,
    copySecret,
    loadAiConversations,
    saveAiConversation,
    deleteAiConversation,
    notify,
  } = useVault();

  const [engineMode, setEngineMode] = useState<'local' | 'gemini'>('local');
  const [serverGeminiReady, setServerGeminiReady] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [conversations, setConversations] = useState<AiConversationThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessageRecord[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const feedRef = useRef<HTMLDivElement | null>(null);

  const geminiAvailable = serverGeminiReady || Boolean(cloudApiKey.trim());

  // Check if server GEMINI_API_KEY exists without exposing it
  useEffect(() => {
    fetch('/api/ai/copilot')
      .then((r) => r.json())
      .then((d: { serverGeminiConfigured?: boolean }) => {
        if (d.serverGeminiConfigured) {
          setServerGeminiReady(true);
          setEngineMode('gemini');
        }
      })
      .catch(() => null);
  }, []);

  // Load encrypted conversation history when unlocked
  useEffect(() => {
    loadAiConversations()
      .then((threads) => setConversations(threads))
      .catch(() => null);
  }, [loadAiConversations]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, busy, open]);

  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.text.toLowerCase().includes(q)),
    );
  }, [conversations, historySearch]);

  const persistThread = async (
    nextMessages: AiChatMessageRecord[],
    existingId: string | null,
  ): Promise<string> => {
    const now = new Date().toISOString();
    const id = existingId ?? generateUuid();
    const firstUserText =
      nextMessages.find((m) => m.role === 'user')?.text ?? 'Vault Conversation';
    const title =
      firstUserText.replace(/\s+/g, ' ').slice(0, 60) +
      (firstUserText.length > 60 ? '...' : '');

    const thread: AiConversationThread = {
      id,
      title,
      updatedAt: now,
      messages: nextMessages,
    };

    await saveAiConversation(thread);
    setConversations((prev) => {
      const rest = prev.filter((t) => t.id !== id);
      return [thread, ...rest];
    });
    return id;
  };

  const sendMessage = async (rawText: string) => {
    const clean = rawText.trim();
    if (!clean || busy) return;

    const userMsg: AiChatMessageRecord = {
      id: generateUuid(),
      role: 'user',
      text: clean,
      createdAt: new Date().toISOString(),
    };

    const updatedWithUser = [...messages, userMsg];
    setMessages(updatedWithUser);
    setInput('');
    setBusy(true);

    const uiState = {
      activeTab,
      theme,
      backendMode,
      paymentEnabled: profile?.preferences.enablePaymentCategory ?? false,
    };

    try {
      let replyObj: CopilotReply;

      const wantsCloud =
        engineMode === 'gemini' &&
        (serverGeminiReady ||
          (Boolean(profile?.preferences.cloudAiEnabled) && Boolean(cloudApiKey.trim())));

      if (wantsCloud) {
        const snapshot = buildSafeCopilotSnapshot(items, uiState);
        const res = await fetch('/api/ai/copilot', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(cloudApiKey.trim() ? { 'x-gemini-api-key': cloudApiKey.trim() } : {}),
          },
          body: JSON.stringify({
            message: clean,
            history: updatedWithUser
              .slice(-6)
              .map((m) => ({ role: m.role, text: m.text })),
            snapshot,
          }),
        });
        const data = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          throw new Error(String(data.error ?? 'Gemini request failed'));
        }
        replyObj = parseGeminiCopilotResponse(
          data as Parameters<typeof parseGeminiCopilotResponse>[0],
        );
      } else {
        replyObj = processLocalCopilotTurn(clean, items, uiState);
      }

      if (replyObj.immediateUiAction) {
        onExecuteUiAction(replyObj.immediateUiAction);
      }

      const aiMsg: AiChatMessageRecord = {
        id: generateUuid(),
        role: 'assistant',
        text: replyObj.reply,
        source: replyObj.source,
        model: replyObj.model,
        matchedItemIds: replyObj.matchedItemIds,
        pendingActionJson: replyObj.pendingAction
          ? JSON.stringify(replyObj.pendingAction)
          : null,
        actionStatus: replyObj.pendingAction ? 'pending' : undefined,
        createdAt: new Date().toISOString(),
      };

      const finalMessages = [...updatedWithUser, aiMsg];
      setMessages(finalMessages);
      const savedId = await persistThread(finalMessages, activeThreadId);
      setActiveThreadId(savedId);
    } catch (err) {
      const fallback = processLocalCopilotTurn(clean, items, uiState);
      const errNote =
        err instanceof Error ? err.message : 'Gemini request failed.';
      const aiMsg: AiChatMessageRecord = {
        id: generateUuid(),
        role: 'assistant',
        text: `*(Cloud AI unavailable: ${errNote} — answered locally instead)*\n\n${fallback.reply}`,
        source: 'local',
        matchedItemIds: fallback.matchedItemIds,
        pendingActionJson: fallback.pendingAction
          ? JSON.stringify(fallback.pendingAction)
          : null,
        actionStatus: fallback.pendingAction ? 'pending' : undefined,
        createdAt: new Date().toISOString(),
      };
      const finalMessages = [...updatedWithUser, aiMsg];
      setMessages(finalMessages);
      const savedId = await persistThread(finalMessages, activeThreadId);
      setActiveThreadId(savedId);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (open && queuedPrompt && queuedPrompt !== '__open_import__') {
      void sendMessage(queuedPrompt);
      onClearQueuedPrompt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, queuedPrompt]);

  const handleConfirmPendingAction = async (
    msgId: string,
    action: CopilotPendingAction,
  ) => {
    try {
      if (action.type === 'create_item') {
        const nextPayload = { ...action.payload, fields: { ...action.payload.fields } };
        if (action.generateStrongPasswordForField) {
          nextPayload.fields[action.generateStrongPasswordForField] =
            generateStrongPassword({ length: 20 });
        }
        const created = await createItem(nextPayload);
        notify(`Encrypted and saved "${created.payload.title}".`, 'teal');
      } else if (action.type === 'bulk_import') {
        await bulkCreateItems(action.payloads);
        notify(
          `Encrypted and imported ${action.payloads.length} record(s).`,
          'teal',
        );
      } else if (action.type === 'update_item') {
        const existing = itemMap.get(action.itemId);
        if (!existing) throw new Error('Target vault entry not found.');
        const mergedPayload = {
          ...existing.payload,
          ...action.nextPayload,
          fields: {
            ...existing.payload.fields,
            ...(action.nextPayload.fields ?? {}),
          },
        };
        if (action.generateStrongPassword) {
          mergedPayload.fields.password = generateStrongPassword({ length: 22 });
        }
        await updateItem(existing, mergedPayload);
        notify(`Updated "${existing.payload.title}" and encrypted locally.`, 'teal');
      } else if (action.type === 'trash_item') {
        const existing = itemMap.get(action.itemId);
        if (!existing) throw new Error('Target vault entry not found.');
        await softDeleteItem(existing);
        notify(`Moved "${existing.payload.title}" to Trash.`, 'warning');
      } else if (action.type === 'restore_item') {
        const existing = itemMap.get(action.itemId);
        if (!existing) throw new Error('Target vault entry not found.');
        await restoreItem(existing);
        notify(`Restored "${existing.payload.title}" to Vault.`, 'teal');
      } else if (action.type === 'ui_action') {
        onExecuteUiAction(action.uiAction);
      }

      const nextMessages = messages.map((m) =>
        m.id === msgId ? { ...m, actionStatus: 'executed' as const } : m,
      );
      setMessages(nextMessages);
      if (activeThreadId) {
        await persistThread(nextMessages, activeThreadId);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action failed.', 'danger');
    }
  };

  const handleDismissPendingAction = async (msgId: string) => {
    const nextMessages = messages.map((m) =>
      m.id === msgId ? { ...m, actionStatus: 'dismissed' as const } : m,
    );
    setMessages(nextMessages);
    if (activeThreadId) {
      await persistThread(nextMessages, activeThreadId);
    }
  };

  const startNewChat = () => {
    setActiveThreadId(null);
    setMessages([]);
    setShowHistory(false);
  };

  const handleDeleteThread = async (
    e: React.MouseEvent,
    threadId: string,
  ) => {
    e.stopPropagation();
    await deleteAiConversation(threadId);
    setConversations((prev) => prev.filter((c) => c.id !== threadId));
    if (activeThreadId === threadId) {
      startNewChat();
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] lg:hidden"
      />

      {/* Side-by-Side Docked Panel */}
      <aside className="fixed top-0 right-0 z-50 flex h-screen w-full flex-col border-l border-slate-200 bg-slate-50 shadow-2xl sm:w-[390px] xl:w-[420px] dark:border-[#273342] dark:bg-[#11171F]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-4 py-3.5 text-white dark:border-[#273342] dark:bg-[#0B0F14]">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600/25 ring-1 ring-teal-400/40">
              <Sparkles className="h-4 w-4 text-teal-300" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">KeyNest Copilot</div>
              <div className="truncate text-[11px] text-slate-300">
                {engineMode === 'gemini'
                  ? 'Gemini · Metadata-Only Safe Sync'
                  : 'Side-by-Side · Local Zero-Knowledge'}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                showHistory
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
              title="Conversation History"
            >
              <History className="h-3.5 w-3.5" />
              <span>History</span>
            </button>

            <button
              type="button"
              onClick={startNewChat}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              title="Start New Chat"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>New</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              title="Close AI Assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Engine Mode Switcher Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 text-xs dark:border-[#24303F] dark:bg-[#161D26]">
          <span className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            Secrets never leave memory
          </span>

          <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-[#0F141A]">
            <button
              type="button"
              onClick={() => setEngineMode('local')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                engineMode === 'local'
                  ? 'bg-white text-teal-700 shadow-xs dark:bg-[#1E2733] dark:text-teal-300'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Local ZK
            </button>
            <button
              type="button"
              onClick={() => {
                if (!geminiAvailable) {
                  notify(
                    'Add your own GEMINI_API_KEY in .env.local or Settings to enable Gemini mode. Using Local ZK.',
                    'warning',
                  );
                  return;
                }
                setEngineMode('gemini');
              }}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                engineMode === 'gemini'
                  ? 'bg-white text-sky-700 shadow-xs dark:bg-[#1E2733] dark:text-sky-300'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Cloud className="h-3 w-3" /> Gemini
            </button>
          </div>
        </div>

        {/* History View */}
        {showHistory ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="space-y-2 border-b border-slate-200 bg-white p-3 dark:border-[#24303F] dark:bg-[#161D26]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold tracking-wider text-slate-600 uppercase dark:text-slate-300">
                  Encrypted Chat History
                </span>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Chat
                </button>
              </div>
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search past encrypted chats..."
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-slate-100"
              />
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {filteredHistory.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                  No saved encrypted conversations yet.
                </div>
              ) : (
                filteredHistory.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => {
                      setActiveThreadId(conv.id);
                      setMessages(conv.messages);
                      setShowHistory(false);
                    }}
                    className={`cursor-pointer rounded-xl border p-3 transition ${
                      activeThreadId === conv.id
                        ? 'border-teal-500/50 bg-teal-50 dark:bg-teal-500/10'
                        : 'border-slate-200 bg-white hover:border-teal-400/50 dark:border-[#24303F] dark:bg-[#161D26]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                          {conv.title}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {new Date(conv.updatedAt).toLocaleString()} · {conv.messages.length} msgs
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteThread(e, conv.id)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Active Chat View */
          <div className="flex flex-1 flex-col overflow-hidden">
            <div ref={feedRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Welcome, {user?.email.split('@')[0] || 'friend'}!
                  </p>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    Use <strong>KeyNest Copilot</strong> side by side on any screen. Ask questions, create or update encrypted entries, audit weak passwords, switch Light/Dark theme, or paste raw account notes — every mutation asks your approval first.
                  </p>
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      Try asking:
                    </p>
                    {[
                      'Give me my vault status & security summary',
                      'Add a login for Notion with email logfroze@gmail.com',
                      'Find my GitHub API token',
                      'Check weak passwords & open Security Center',
                      'Switch to dark mode',
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => sendMessage(prompt)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 transition hover:border-teal-400 hover:bg-teal-50/70 dark:border-[#2A3748] dark:bg-[#10161D] dark:text-slate-200 dark:hover:border-teal-500/50 dark:hover:bg-teal-500/10"
                      >
                        &ldquo;{prompt}&rdquo;
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => {
                const pendingAction = msg.pendingActionJson
                  ? (JSON.parse(msg.pendingActionJson) as CopilotPendingAction)
                  : null;
                const matched = (msg.matchedItemIds ?? [])
                  .map((id) => itemMap.get(id))
                  .filter((x): x is DecryptedVaultItem => Boolean(x));

                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-teal-600 px-3.5 py-2.5 text-sm text-white shadow-xs">
                        {msg.text}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className="max-w-[94%] space-y-2.5 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-xs dark:border-[#24303F] dark:bg-[#161D26] dark:text-slate-100">
                      <div className="leading-relaxed whitespace-pre-wrap">
                        {msg.text}
                      </div>

                      {/* Matched Vault Items (resolved locally in memory!) */}
                      {matched.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {matched.map((item) => {
                            const secret = getPrimarySecret(item.payload);
                            return (
                              <div
                                key={item.id}
                                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-[#2A3748] dark:bg-[#0F141A]"
                              >
                                <button
                                  type="button"
                                  onClick={() => onSelectItem(item)}
                                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                                >
                                  <ServiceMonogram title={item.payload.title} size="sm" />
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                                      {item.payload.title}
                                    </p>
                                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                      {getPrimaryIdentifier(item.payload)}
                                    </p>
                                  </div>
                                </button>
                                <div className="flex shrink-0 items-center gap-1">
                                  {secret && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        copySecret(secret, `${item.payload.title} secret`)
                                      }
                                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-teal-700 hover:border-teal-400 dark:border-[#2C3A4B] dark:bg-[#161D26] dark:text-teal-300"
                                      title="Copy secret"
                                    >
                                      <Copy className="inline h-3 w-3" /> Copy
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => onSelectItem(item)}
                                    className="rounded-lg p-1.5 text-slate-400 hover:text-teal-600 dark:hover:text-teal-300"
                                    title="Open in Vault"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Confirmation Action Card */}
                      {pendingAction && msg.actionStatus === 'executed' && (
                        <div className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span>Confirmed &amp; Encrypted</span>
                        </div>
                      )}

                      {pendingAction && msg.actionStatus === 'dismissed' && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 dark:border-[#273342] dark:bg-[#0F141A] dark:text-slate-400">
                          Action cancelled.
                        </div>
                      )}

                      {pendingAction && msg.actionStatus === 'pending' && (
                        <div className="space-y-2.5 rounded-xl border border-teal-200 bg-teal-50/60 p-3.5 dark:border-teal-500/35 dark:bg-teal-500/10">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                            <Lock className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                            <span>{pendingAction.title}</span>
                          </div>
                          <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-200">
                            {pendingAction.summaryLines.map((line, i) => (
                              <li key={i} className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleConfirmPendingAction(msg.id, pendingAction)
                              }
                              className="flex-1 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-500"
                            >
                              Confirm &amp; Encrypt
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDismissPendingAction(msg.id)}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-[#2F3D50] dark:bg-[#161D26] dark:text-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {msg.source === 'gemini' && (
                        <p className="text-[10px] text-slate-400">
                          Gemini ({msg.model ?? 'cloud'}) · Secret-redacted context
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              {busy && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500 dark:border-[#24303F] dark:bg-[#161D26] dark:text-slate-300">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500" />
                    <span>Thinking...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage(input);
              }}
              className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white p-3 dark:border-[#24303F] dark:bg-[#161D26]"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask or tell KeyNest AI what to do..."
                className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white dark:placeholder-slate-400"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white transition hover:bg-teal-500 disabled:opacity-40"
                title="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}
      </aside>
    </>
  );
}
