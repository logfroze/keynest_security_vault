'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Cloud,
  Copy,
  FileText,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { queryOptionalCloudAi } from '@/modules/ai/cloudAi';
import {
  parseUnstructuredImportText,
  processLocalAssistantQuery,
  type AssistantResponse,
  type ImportAnalysisResult,
  type ParsedImportCandidate,
} from '@/modules/ai/localParser';
import {
  CATEGORY_DEFINITIONS,
  getPrimaryIdentifier,
  VAULT_CATEGORY_ORDER,
} from '@/modules/vault/schemas';
import type { DecryptedVaultItem, VaultCategory } from '@/types/vault';
import { useVault } from '../providers/VaultProvider';
import { ServiceMonogram } from '../ui/CategoryIcon';

const SAMPLE_UNSTRUCTURED_TEXT = `Facebook account
Email: logfroze@gmail.com
Password: myfacebookpassword123
Website: facebook.com

GitHub
Username: logfrozeofficial
Email: logfroze@gmail.com
Token: ghp_exampleToken9876543210KeyNest

Bank Alfalah
Account title: Muhammad Umar
IBAN: PK36ALFH0000001001234567`;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  response?: AssistantResponse;
}

export function VaultAiWorkspace({
  initialTab = 'import',
  initialPrompt,
  cloudApiKey,
  onClearInitialPrompt,
  onSelectItem,
}: {
  initialTab?: 'assistant' | 'import';
  initialPrompt?: string;
  cloudApiKey: string;
  onClearInitialPrompt: () => void;
  onSelectItem: (item: DecryptedVaultItem) => void;
}) {
  const { items, profile, bulkCreateItems, updateItem, copySecret, notify } =
    useVault();

  const [tab, setTab] = useState<'assistant' | 'import'>(initialTab);
  const [rawImportText, setRawImportText] = useState('');
  const [analysis, setAnalysis] = useState<ImportAnalysisResult | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<Record<string, boolean>>({});
  const [committingImport, setCommittingImport] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Local Zero-Knowledge AI workspace ready. Use Smart Bulk Import for pasting text files, or click "Ask AI" in the top bar anytime for the side-by-side KeyNest Copilot.',
    },
  ]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [approvedUpdates, setApprovedUpdates] = useState<Record<string, boolean>>({});

  const cloudEnabled = Boolean(profile?.preferences.cloudAiEnabled);

  const runAssistantPrompt = (promptText: string) => {
    const clean = promptText.trim();
    if (!clean) return;
    const response = processLocalAssistantQuery(clean, items);
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', text: clean },
      { id: `a-${Date.now() + 1}`, role: 'assistant', text: response.message, response },
    ]);
  };

  useEffect(() => {
    if (!initialPrompt) return;
    if (initialPrompt === '__open_import__') {
      setTab('import');
      onClearInitialPrompt();
      return;
    }
    setTab('assistant');
    runAssistantPrompt(initialPrompt);
    onClearInitialPrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const handleAnalyzeImport = (textToParse = rawImportText) => {
    if (!textToParse.trim()) {
      notify('Paste unstructured text or upload a .txt file first.', 'warning');
      return;
    }
    const result = parseUnstructuredImportText(textToParse, items);
    setAnalysis(result);
    const defaults: Record<string, boolean> = {};
    for (const c of result.candidates) {
      defaults[c.tempId] = c.status !== 'duplicate';
    }
    setSelectedImportIds(defaults);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setRawImportText(content);
    handleAnalyzeImport(content);
    e.target.value = '';
  };

  const updateCandidate = (
    tempId: string,
    updater: (prev: ParsedImportCandidate) => ParsedImportCandidate,
  ) => {
    setAnalysis((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        candidates: prev.candidates.map((c) => (c.tempId === tempId ? updater(c) : c)),
      };
    });
  };

  const handleApproveImport = async () => {
    if (!analysis) return;
    const chosen = analysis.candidates.filter((c) => selectedImportIds[c.tempId]);
    if (chosen.length === 0) {
      notify('Select at least one record to encrypt and save.', 'warning');
      return;
    }
    setCommittingImport(true);
    try {
      await bulkCreateItems(chosen.map((c) => c.payload));
      notify(
        `Encrypted and saved ${chosen.length} record${chosen.length === 1 ? '' : 's'} to your vault.`,
        'teal',
      );
      setAnalysis(null);
      setRawImportText('');
    } finally {
      setCommittingImport(false);
    }
  };

  const handleApproveDraftUpdate = async (msgId: string, resp: AssistantResponse) => {
    if (!resp.draftUpdate) return;
    const existing = items.find((i) => i.id === resp.draftUpdate!.itemId);
    if (!existing) {
      notify('Target vault record no longer exists.', 'danger');
      return;
    }
    await updateItem(existing, resp.draftUpdate.nextPayload);
    setApprovedUpdates((prev) => ({ ...prev, [msgId]: true }));
    notify(`Updated "${existing.payload.title}" and encrypted locally.`, 'teal');
  };

  const handleAskCloudExplicit = async () => {
    if (!cloudEnabled || !cloudApiKey.trim()) {
      notify('Enable Optional Cloud AI and add a key in Settings first.', 'warning');
      return;
    }
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;

    setCloudLoading(true);
    try {
      const res = await queryOptionalCloudAi({
        provider: profile?.preferences.cloudAiProvider ?? 'gemini',
        apiKey: cloudApiKey,
        prompt: lastUser.text,
        includeRedactedContext: true,
        items,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `cloud-${Date.now()}`,
          role: 'assistant',
          text: `[Cloud AI · ${res.provider.toUpperCase()} · Redacted Index Only]\n\n${res.text}`,
        },
      ]);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Cloud AI call failed.', 'danger');
    } finally {
      setCloudLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">
              Smart Bulk Import &amp; AI Workspace
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Parses unstructured account notes locally in browser memory — zero secrets leave your device.
            </p>
          </div>
        </div>

        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-[#0F141A]">
          <button
            type="button"
            onClick={() => setTab('import')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              tab === 'import'
                ? 'bg-white text-teal-700 shadow-xs dark:bg-[#1E2733] dark:text-teal-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Smart Bulk Import
          </button>
          <button
            type="button"
            onClick={() => setTab('assistant')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              tab === 'assistant'
                ? 'bg-white text-teal-700 shadow-xs dark:bg-[#1E2733] dark:text-teal-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Local Search Chat
          </button>
        </div>
      </div>

      {tab === 'import' ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Paste Unstructured Notes or Upload Text File
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Extracts accounts, tokens, IBANs, and personal info locally before encryption.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRawImportText(SAMPLE_UNSTRUCTURED_TEXT);
                    handleAnalyzeImport(SAMPLE_UNSTRUCTURED_TEXT);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 dark:border-teal-500/35 dark:bg-teal-500/15 dark:text-teal-300"
                >
                  <FileText className="h-3.5 w-3.5" /> Try Sample Text
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-[#2C3A4B] dark:bg-[#1E2733] dark:text-slate-200">
                  <Upload className="h-3.5 w-3.5" /> Upload .txt
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <textarea
              rows={8}
              value={rawImportText}
              onChange={(e) => setRawImportText(e.target.value)}
              placeholder={`Paste raw accounts here, e.g.:\n\nFacebook account\nEmail: logfroze@gmail.com\nPassword: mypassword123\nWebsite: facebook.com`}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3.5 font-mono text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-slate-100 dark:placeholder-slate-500"
            />

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => handleAnalyzeImport()}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-500"
              >
                <Sparkles className="h-4 w-4" /> Analyze Locally
              </button>
            </div>
          </div>

          {analysis && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-[#24303F]">
                <div>
                  <p className="text-[11px] font-bold tracking-widest text-teal-600 uppercase dark:text-teal-400">
                    IMPORT ANALYSIS
                  </p>
                  <h3 className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
                    Found {analysis.totalFound} record{analysis.totalFound === 1 ? '' : 's'} — review before encrypting
                  </h3>
                </div>

                <div className="flex flex-wrap gap-2 text-xs font-medium">
                  <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    {analysis.readyCount} Ready
                  </span>
                  {analysis.duplicateCount > 0 && (
                    <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                      {analysis.duplicateCount} Duplicate
                    </span>
                  )}
                  {analysis.incompleteCount > 0 && (
                    <span className="rounded-lg bg-sky-50 px-2.5 py-1 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                      {analysis.incompleteCount} Incomplete
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {analysis.candidates.map((cand) => {
                  const checked = Boolean(selectedImportIds[cand.tempId]);
                  const catDef = CATEGORY_DEFINITIONS[cand.payload.category];

                  return (
                    <div
                      key={cand.tempId}
                      className={`rounded-xl border p-4 transition ${
                        checked
                          ? 'border-teal-300 bg-slate-50 dark:border-teal-500/35 dark:bg-[#0F141A]'
                          : 'border-slate-200 bg-slate-50/50 opacity-60 dark:border-[#24303F] dark:bg-[#0F141A]/50'
                      }`}
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setSelectedImportIds((p) => ({
                                ...p,
                                [cand.tempId]: e.target.checked,
                              }))
                            }
                            className="h-4 w-4 accent-teal-600"
                          />
                          <input
                            type="text"
                            value={cand.payload.title}
                            onChange={(e) =>
                              updateCandidate(cand.tempId, (prev) => ({
                                ...prev,
                                payload: { ...prev.payload, title: e.target.value },
                              }))
                            }
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#161D26] dark:text-white"
                          />
                          <select
                            value={cand.payload.category}
                            onChange={(e) => {
                              const nextCat = e.target.value as VaultCategory;
                              updateCandidate(cand.tempId, (prev) => ({
                                ...prev,
                                payload: { ...prev.payload, category: nextCat },
                              }));
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-teal-700 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#161D26] dark:text-teal-300"
                          >
                            {VAULT_CATEGORY_ORDER.map((cat) => (
                              <option key={cat} value={cat}>
                                {CATEGORY_DEFINITIONS[cat].label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Confidence: {Math.round(cand.confidence * 100)}%
                        </span>
                      </div>

                      {cand.warnings.length > 0 && (
                        <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span>{cand.warnings.join(' · ')}</span>
                        </div>
                      )}

                      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                        {catDef.fields.map((f) => {
                          const val = cand.payload.fields[f.key] ?? '';
                          return (
                            <div key={f.key}>
                              <label className="mb-1 block text-[11px] font-medium text-slate-500 uppercase dark:text-slate-400">
                                {f.label}
                              </label>
                              <input
                                type="text"
                                value={val}
                                onChange={(e) =>
                                  updateCandidate(cand.tempId, (prev) => ({
                                    ...prev,
                                    payload: {
                                      ...prev.payload,
                                      fields: {
                                        ...prev.payload.fields,
                                        [f.key]: e.target.value,
                                      },
                                    },
                                  }))
                                }
                                placeholder="(empty)"
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-[#273342] dark:bg-[#161D26] dark:text-slate-100"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-[#24303F]">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Selected records will be encrypted client-side with unique 96-bit AES-GCM nonces.
                </p>
                <button
                  type="button"
                  disabled={committingImport}
                  onClick={handleApproveImport}
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {committingImport
                    ? 'Encrypting Records...'
                    : `Approve & Encrypt (${Object.values(selectedImportIds).filter(Boolean).length})`}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
          <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-3 dark:border-[#24303F]">
            {[
              'Find my GitHub API token',
              'Show me all my developer credentials',
              'Find accounts associated with logfroze@gmail.com',
              'Check weak passwords',
            ].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => runAssistantPrompt(sample)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:border-teal-400 hover:text-teal-700 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-slate-200 dark:hover:text-teal-300"
              >
                {sample}
              </button>
            ))}
          </div>

          <div className="max-h-[55vh] space-y-4 overflow-y-auto p-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-teal-600 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-800 dark:border-[#273342] dark:bg-[#0F141A] dark:text-slate-100'
                  }`}
                >
                  {msg.text}
                </div>

                {msg.response && msg.response.matchedItems.length > 0 && (
                  <div className="mt-2 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                    {msg.response.matchedItems.map((item) => {
                      const secret =
                        item.payload.fields.apiKey ||
                        item.payload.fields.password ||
                        item.payload.fields.secretKey ||
                        item.payload.fields.iban;
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-[#273342] dark:bg-[#1B2430]"
                        >
                          <button
                            type="button"
                            onClick={() => onSelectItem(item)}
                            className="flex min-w-0 items-center gap-2.5 text-left"
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
                          {secret && (
                            <button
                              type="button"
                              onClick={() => copySecret(secret, item.payload.title)}
                              className="ml-2 shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-teal-600 hover:border-teal-400 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-teal-300"
                            >
                              <Copy className="inline h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {msg.response?.draftUpdate && (
                  <div className="mt-2 w-full max-w-2xl rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs dark:border-amber-500/35 dark:bg-amber-500/10">
                    <p className="font-semibold text-amber-900 dark:text-amber-200">
                      Approval Required: Update {msg.response.draftUpdate.itemTitle}
                    </p>
                    <p className="mt-1 text-slate-700 dark:text-slate-200">
                      Field: <strong>{msg.response.draftUpdate.fieldLabel}</strong> (
                      {msg.response.draftUpdate.previousValueMasked} → ••••••••)
                    </p>
                    {approvedUpdates[msg.id] ? (
                      <span className="mt-2 inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" /> Encrypted &amp; Saved
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleApproveDraftUpdate(msg.id, msg.response!)}
                        className="mt-2.5 rounded-lg bg-teal-600 px-3 py-1.5 font-medium text-white hover:bg-teal-500"
                      >
                        Approve &amp; Encrypt Update
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAssistantPrompt(chatInput);
              setChatInput('');
            }}
            className="flex flex-wrap items-center gap-2 border-t border-slate-200 p-4 dark:border-[#24303F]"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder='Ask locally (e.g. "Find my GitHub API token", "Update Facebook password to ...")'
              className="min-w-[220px] flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-500"
            >
              <Send className="h-4 w-4" /> Ask Locally
            </button>
            {cloudEnabled && (
              <button
                type="button"
                disabled={cloudLoading}
                onClick={handleAskCloudExplicit}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3.5 py-2.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300"
              >
                <Cloud className="h-3.5 w-3.5" />
                {cloudLoading ? 'Querying...' : 'Send Last Prompt to Cloud AI'}
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
