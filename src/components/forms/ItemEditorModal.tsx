'use client';

import React, { useMemo, useState } from 'react';
import {
  Eye,
  EyeOff,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  evaluatePasswordStrength,
  generateStrongPassword,
} from '@/modules/cryptography/password';
import {
  CATEGORY_DEFINITIONS,
  createEmptyPayload,
  VAULT_CATEGORY_ORDER,
} from '@/modules/vault/schemas';
import { generateUuid } from '@/modules/vault/vaultManager';
import type {
  CustomField,
  CustomFieldType,
  DecryptedVaultItem,
  VaultCategory,
  VaultItemPayload,
} from '@/types/vault';
import { CategoryIcon } from '../ui/CategoryIcon';

interface ItemEditorModalProps {
  initialItem?: DecryptedVaultItem | null;
  initialCategory?: VaultCategory;
  paymentEnabled: boolean;
  onSave: (payload: VaultItemPayload) => Promise<void>;
  onClose: () => void;
}

export function ItemEditorModal({
  initialItem,
  initialCategory = 'login',
  paymentEnabled,
  onSave,
  onClose,
}: ItemEditorModalProps) {
  const [payload, setPayload] = useState<VaultItemPayload>(() => {
    if (initialItem) {
      return {
        ...initialItem.payload,
        fields: { ...initialItem.payload.fields },
        customFields: initialItem.payload.customFields.map((c) => ({ ...c })),
        tags: [...initialItem.payload.tags],
      };
    }
    return createEmptyPayload(initialCategory);
  });

  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryDef = CATEGORY_DEFINITIONS[payload.category];
  const primaryPassword = payload.fields.password ?? '';
  const pwStrength = useMemo(
    () => (primaryPassword ? evaluatePasswordStrength(primaryPassword) : null),
    [primaryPassword],
  );

  const availableCategories = useMemo(
    () =>
      VAULT_CATEGORY_ORDER.filter(
        (cat) => cat !== 'payment' || paymentEnabled || payload.category === 'payment',
      ),
    [paymentEnabled, payload.category],
  );

  const switchCategory = (nextCategory: VaultCategory) => {
    if (initialItem) return;
    const fresh = createEmptyPayload(nextCategory);
    setPayload((prev) => ({
      ...fresh,
      title: prev.title,
      tags: prev.tags,
      notes: prev.notes,
      favorite: prev.favorite,
      fields: {
        ...fresh.fields,
        ...Object.fromEntries(
          Object.entries(prev.fields).filter(([k, v]) => k in fresh.fields && v),
        ),
      },
    }));
  };

  const setField = (key: string, value: string) => {
    setPayload((prev) => ({
      ...prev,
      fields: { ...prev.fields, [key]: value },
    }));
  };

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addCustomField = () => {
    const next: CustomField = {
      id: generateUuid(),
      label: '',
      type: 'text',
      value: '',
    };
    setPayload((prev) => ({
      ...prev,
      customFields: [...prev.customFields, next],
    }));
  };

  const updateCustomField = (id: string, patch: Partial<CustomField>) => {
    setPayload((prev) => ({
      ...prev,
      customFields: prev.customFields.map((cf) =>
        cf.id === id ? { ...cf, ...patch } : cf,
      ),
    }));
  };

  const removeCustomField = (id: string) => {
    setPayload((prev) => ({
      ...prev,
      customFields: prev.customFields.filter((cf) => cf.id !== id),
    }));
  };

  const addTag = () => {
    const clean = tagInput.trim();
    if (!clean) return;
    if (!payload.tags.includes(clean)) {
      setPayload((prev) => ({ ...prev, tags: [...prev.tags, clean] }));
    }
    setTagInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!payload.title.trim()) {
      setError('Please enter a title for this entry.');
      return;
    }

    const cleanedCustom = payload.customFields.filter((cf) => cf.label.trim().length > 0);
    setSaving(true);
    try {
      await onSave({
        ...payload,
        title: payload.title.trim(),
        customFields: cleanedCustom,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save encrypted entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs dark:bg-black/75">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-[#24303F] dark:bg-[#161D26]">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-[#24303F]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400">
              <CategoryIcon category={payload.category} className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {initialItem ? `Edit ${initialItem.payload.title}` : 'New Encrypted Entry'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{categoryDef.label}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setPayload((prev) => ({ ...prev, favorite: !prev.favorite }))
              }
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                payload.favorite
                  ? 'border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300'
                  : 'border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-800 dark:border-[#273342] dark:bg-[#0F141A] dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Star
                className={`inline h-3.5 w-3.5 ${payload.favorite ? 'fill-amber-400 text-amber-400' : ''}`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-[#1E2733] dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {!initialItem && (
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Category Format
              </label>
              <div className="flex flex-wrap gap-1.5">
                {availableCategories.map((cat) => {
                  const active = payload.category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => switchCategory(cat)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        active
                          ? 'border-teal-500/50 bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-[#273342] dark:bg-[#0F141A] dark:text-slate-300 dark:hover:text-white'
                      }`}
                    >
                      <CategoryIcon category={cat} className="h-3.5 w-3.5" />
                      {CATEGORY_DEFINITIONS[cat].shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={payload.category === 'custom' ? '' : 'sm:col-span-2'}>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Title *
              </label>
              <input
                type="text"
                required
                value={payload.title}
                onChange={(e) =>
                  setPayload((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="e.g., GitHub, Bank Alfalah, Facebook"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
              />
            </div>

            {payload.category === 'custom' && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Custom Category Label
                </label>
                <input
                  type="text"
                  value={payload.customCategoryName ?? ''}
                  onChange={(e) =>
                    setPayload((prev) => ({
                      ...prev,
                      customCategoryName: e.target.value,
                    }))
                  }
                  placeholder="e.g., Crypto Seed, Server SSH"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
                />
              </div>
            )}
          </div>

          <div className="space-y-3.5">
            {categoryDef.fields.map((field) => {
              const value = payload.fields[field.key] ?? '';
              const isSecret = field.type === 'password';
              const isRevealed = Boolean(revealedKeys[field.key]);

              return (
                <div key={field.key}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {field.label}
                    </label>
                    {field.key === 'password' && (
                      <button
                        type="button"
                        onClick={() => {
                          setField('password', generateStrongPassword({ length: 20 }));
                          setRevealedKeys((prev) => ({ ...prev, password: true }));
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Generate Strong
                      </button>
                    )}
                  </div>

                  {field.type === 'textarea' ? (
                    <textarea
                      rows={3}
                      value={value}
                      onChange={(e) => setField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
                    />
                  ) : (
                    <div className="relative">
                      <input
                        type={isSecret && !isRevealed ? 'password' : field.type === 'password' ? 'text' : field.type}
                        value={value}
                        onChange={(e) => setField(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className={`w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-3 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white ${
                          isSecret ? 'pr-10 font-mono' : 'pr-3'
                        }`}
                      />
                      {isSecret && (
                        <button
                          type="button"
                          onClick={() => toggleReveal(field.key)}
                          className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          {isRevealed ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {field.key === 'password' && pwStrength && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-[#1E2733]">
                        <div
                          className={`h-full transition-all ${
                            pwStrength.score >= 4
                              ? 'w-full bg-emerald-500'
                              : pwStrength.score === 3
                                ? 'w-3/4 bg-teal-500'
                                : pwStrength.score === 2
                                  ? 'w-1/2 bg-amber-500'
                                  : 'w-1/4 bg-red-500'
                          }`}
                        />
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {pwStrength.label}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-200 pt-4 dark:border-[#24303F]">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Custom Fields ({payload.customFields.length})
              </span>
              <button
                type="button"
                onClick={addCustomField}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-teal-700 hover:border-teal-400 dark:border-[#2C3A4B] dark:bg-[#1E2733] dark:text-teal-300"
              >
                <Plus className="h-3.5 w-3.5" /> Add Field
              </button>
            </div>

            {payload.customFields.length > 0 && (
              <div className="space-y-2.5">
                {payload.customFields.map((cf) => (
                  <div
                    key={cf.id}
                    className="grid grid-cols-12 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-[#273342] dark:bg-[#0F141A]"
                  >
                    <input
                      type="text"
                      value={cf.label}
                      onChange={(e) =>
                        updateCustomField(cf.id, { label: e.target.value })
                      }
                      placeholder="Label"
                      className="col-span-4 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#161D26] dark:text-white"
                    />
                    <select
                      value={cf.type}
                      onChange={(e) =>
                        updateCustomField(cf.id, {
                          type: e.target.value as CustomFieldType,
                        })
                      }
                      className="col-span-3 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#161D26] dark:text-slate-200"
                    >
                      <option value="text">Text</option>
                      <option value="password">Secret</option>
                      <option value="email">Email</option>
                      <option value="url">URL</option>
                      <option value="date">Date</option>
                      <option value="number">Number</option>
                    </select>
                    <input
                      type={cf.type === 'password' ? 'password' : cf.type}
                      value={cf.value}
                      onChange={(e) =>
                        updateCustomField(cf.id, { value: e.target.value })
                      }
                      placeholder="Value"
                      className="col-span-4 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#161D26] dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeCustomField(cf.id)}
                      className="col-span-1 flex justify-center text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Tags
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {payload.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/15 dark:text-teal-300"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() =>
                      setPayload((prev) => ({
                        ...prev,
                        tags: prev.tags.filter((t) => t !== tag),
                      }))
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag (e.g., Work, Finance, Personal)"
                className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
              />
              <button
                type="button"
                onClick={addTag}
                className="rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-[#2C3A4B] dark:bg-[#1E2733] dark:text-slate-200"
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Encrypted Notes
            </label>
            <textarea
              rows={2}
              value={payload.notes}
              onChange={(e) =>
                setPayload((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Additional encrypted notes..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2.5 border-t border-slate-200 pt-4 dark:border-[#24303F]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 dark:border-[#2C3A4B] dark:text-slate-300 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-teal-500 disabled:opacity-50"
            >
              {saving ? 'Encrypting...' : initialItem ? 'Save Changes' : 'Encrypt & Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
