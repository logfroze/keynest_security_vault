'use client';

import React, { useState } from 'react';
import {
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  RotateCcw,
  ShieldAlert,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { evaluatePasswordStrength } from '@/modules/cryptography/password';
import {
  CATEGORY_DEFINITIONS,
  getCategoryLabel,
  isSensitiveRevealRequired,
} from '@/modules/vault/schemas';
import type { DecryptedVaultItem } from '@/types/vault';
import { useVault } from '../providers/VaultProvider';
import { ServiceMonogram } from '../ui/CategoryIcon';

export function VaultInspector({
  item,
  onEdit,
  onClose,
}: {
  item: DecryptedVaultItem;
  onEdit: (item: DecryptedVaultItem) => void;
  onClose: () => void;
}) {
  const {
    profile,
    copySecret,
    updateItem,
    softDeleteItem,
    restoreItem,
    purgeItem,
    notify,
  } = useVault();

  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [confirmTarget, setConfirmTarget] = useState<{
    key: string;
    label: string;
    value: string;
    action: 'reveal' | 'copy';
  } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const categoryDef = CATEGORY_DEFINITIONS[item.payload.category];
  const confirmSensitive = profile?.preferences.confirmSensitiveReveal ?? true;
  const passwordVal = item.payload.fields.password ?? '';
  const pwStrength = passwordVal ? evaluatePasswordStrength(passwordVal) : null;
  const history = item.payload.passwordHistory ?? [];

  const handleRevealClick = (fieldKey: string, label: string, value: string) => {
    if (revealed[fieldKey]) {
      setRevealed((prev) => ({ ...prev, [fieldKey]: false }));
      return;
    }
    if (isSensitiveRevealRequired(item.payload.category, fieldKey, confirmSensitive)) {
      setConfirmTarget({ key: fieldKey, label, value, action: 'reveal' });
      return;
    }
    setRevealed((prev) => ({ ...prev, [fieldKey]: true }));
  };

  const handleCopyClick = async (fieldKey: string, label: string, value: string) => {
    if (!value) return;
    if (isSensitiveRevealRequired(item.payload.category, fieldKey, confirmSensitive)) {
      setConfirmTarget({ key: fieldKey, label, value, action: 'copy' });
      return;
    }
    await copySecret(value, label);
  };

  const executeConfirmedSensitiveAction = async () => {
    if (!confirmTarget) return;
    if (confirmTarget.action === 'reveal') {
      setRevealed((prev) => ({ ...prev, [confirmTarget.key]: true }));
    } else {
      await copySecret(confirmTarget.value, confirmTarget.label);
    }
    setConfirmTarget(null);
  };

  const toggleFavorite = async () => {
    await updateItem(item, {
      ...item.payload,
      favorite: !item.payload.favorite,
    });
  };

  const handleTrashOrPurge = async () => {
    if (item.deletedAt) {
      await purgeItem(item.id);
      notify(`Permanently deleted "${item.payload.title}".`, 'warning');
      onClose();
    } else {
      await softDeleteItem(item);
      notify(`Moved "${item.payload.title}" to Trash.`, 'teal');
    }
  };

  const handleRestore = async () => {
    await restoreItem(item);
    notify(`Restored "${item.payload.title}" to Vault.`, 'teal');
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#161D26]">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-[#24303F]">
        <div className="flex min-w-0 items-center gap-3">
          <ServiceMonogram title={item.payload.title} size="md" />
          <div className="min-w-0">
            <span className="inline-block rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
              {getCategoryLabel(item.payload)}
            </span>
            <h2 className="mt-0.5 truncate text-base font-bold text-slate-900 dark:text-white">
              {item.payload.title}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleFavorite}
            title="Toggle Favorite"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-[#222C3A]"
          >
            <Star
              className={`h-4 w-4 ${item.payload.favorite ? 'fill-amber-400 text-amber-400' : ''}`}
            />
          </button>
          {!item.deletedAt && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              title="Edit Entry"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#222C3A] dark:hover:text-white"
            >
              <Edit3 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close Inspector"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#222C3A] dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Extra Sensitive Reveal Confirmation Banner */}
      {confirmTarget && (
        <div className="m-4 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="mb-2 flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
            <ShieldAlert className="h-4 w-4" />
            Confirm Sensitive Financial Action
          </div>
          <p className="mb-3 text-slate-700 dark:text-slate-200">
            Proceed to {confirmTarget.action} <strong>{confirmTarget.label}</strong>?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={executeConfirmedSensitiveAction}
              className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-slate-950 hover:bg-amber-400"
            >
              Confirm {confirmTarget.action}
            </button>
            <button
              type="button"
              onClick={() => setConfirmTarget(null)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-100 dark:border-[#2C3A4B] dark:bg-[#161D26] dark:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <div className="space-y-3">
          <p className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
            Structured Details
          </p>

          {categoryDef.fields.map((def) => {
            const val = item.payload.fields[def.key];
            if (!val) return null;
            const isSecret = Boolean(def.sensitive || def.type === 'password');
            const isRevealed = Boolean(revealed[def.key]);
            const isUrl = def.type === 'url' || def.key === 'website';

            return (
              <div
                key={def.key}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-[#273342] dark:bg-[#0F141A]"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {def.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isSecret && (
                      <button
                        type="button"
                        onClick={() => handleRevealClick(def.key, def.label, val)}
                        className="rounded p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      >
                        {isRevealed ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    {isUrl && /^https?:\/\//i.test(val) && (
                      <a
                        href={val}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1 text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopyClick(def.key, def.label, val)}
                      className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-teal-700 ring-1 ring-slate-200 hover:ring-teal-400 dark:bg-[#1A232E] dark:text-teal-300 dark:ring-[#2C3A4B]"
                    >
                      <Copy className="mr-1 inline h-3 w-3" />
                      Copy
                    </button>
                  </div>
                </div>

                <p
                  className={`text-sm break-all ${
                    isSecret
                      ? 'font-mono text-slate-900 dark:text-slate-100'
                      : 'text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {isSecret && !isRevealed ? '••••••••••••' : val}
                </p>
              </div>
            );
          })}
        </div>

        {pwStrength && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-[#273342] dark:bg-[#0F141A]">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300">Password Strength</span>
              <span
                className={`font-semibold ${
                  pwStrength.score >= 4
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : pwStrength.score === 3
                      ? 'text-teal-600 dark:text-teal-400'
                      : pwStrength.score === 2
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                }`}
              >
                {pwStrength.label} ({pwStrength.entropyBits} bits)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-[#1E2733]">
              <div
                className={`h-full ${
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
          </div>
        )}

        {history.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-[#273342] dark:bg-[#0F141A]">
            <button
              type="button"
              onClick={() => setShowHistory((prev) => !prev)}
              className="flex w-full items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              <span className="flex items-center gap-1.5">
                <History className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                Password History ({history.length})
              </span>
              <span className="text-slate-500">{showHistory ? 'Hide' : 'Show'}</span>
            </button>

            {showHistory && (
              <div className="mt-3 space-y-2 border-t border-slate-200 pt-2.5 dark:border-[#24303F]">
                {history.map((entry, idx) => {
                  const key = `hist-${idx}`;
                  const vis = Boolean(revealed[key]);
                  return (
                    <div
                      key={`${entry.changedAt}-${idx}`}
                      className="flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="text-[11px] text-slate-500">
                          Changed {new Date(entry.changedAt).toLocaleDateString()}
                        </p>
                        <p className="font-mono text-slate-800 dark:text-slate-200">
                          {vis ? entry.value : '••••••••••'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setRevealed((p) => ({ ...p, [key]: !p[key] }))
                          }
                          className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        >
                          {vis ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => copySecret(entry.value, 'Previous password')}
                          className="text-teal-600 hover:text-teal-700 dark:text-teal-400"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {item.payload.customFields.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Custom Fields
            </p>
            {item.payload.customFields.map((cf) => {
              const isSecret = cf.type === 'password';
              const key = `cf-${cf.id}`;
              const vis = Boolean(revealed[key]);
              return (
                <div
                  key={cf.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-[#273342] dark:bg-[#0F141A]"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {cf.label}
                    </span>
                    <div className="flex items-center gap-2">
                      {isSecret && (
                        <button
                          type="button"
                          onClick={() => setRevealed((p) => ({ ...p, [key]: !p[key] }))}
                          className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        >
                          {vis ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => copySecret(cf.value, cf.label)}
                        className="text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <p className={`text-sm break-all ${isSecret ? 'font-mono' : ''} text-slate-800 dark:text-slate-200`}>
                    {isSecret && !vis ? '••••••••••' : cf.value}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {item.payload.tags.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Tags
            </p>
            <div className="flex flex-wrap gap-1.5">
              {item.payload.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {item.payload.notes && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Notes
            </p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700 dark:border-[#273342] dark:bg-[#0F141A] dark:text-slate-300">
              {item.payload.notes}
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-[#24303F] dark:text-slate-400">
          <p>Created: {new Date(item.createdAt).toLocaleString()}</p>
          <p>Updated: {new Date(item.updatedAt).toLocaleString()}</p>
          <p className="tabular-nums">Revision: #{item.revision} · AES-256-GCM</p>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 dark:border-[#24303F]">
        {item.deletedAt ? (
          <>
            <button
              type="button"
              onClick={handleRestore}
              className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100 dark:border-teal-500/40 dark:bg-teal-500/15 dark:text-teal-300"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restore
            </button>
            <button
              type="button"
              onClick={handleTrashOrPurge}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Forever
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-800 hover:border-teal-400 dark:border-[#2C3A4B] dark:bg-[#1E2733] dark:text-slate-100"
            >
              <Edit3 className="h-3.5 w-3.5" /> Edit Entry
            </button>
            <button
              type="button"
              onClick={handleTrashOrPurge}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Trash
            </button>
          </>
        )}
      </div>
    </div>
  );
}
