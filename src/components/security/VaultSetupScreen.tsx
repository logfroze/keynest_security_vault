'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { evaluatePasswordStrength } from '@/modules/cryptography/password';
import { useTheme } from '../providers/ThemeProvider';
import { useVault } from '../providers/VaultProvider';

export function VaultSetupScreen() {
  const { theme, toggleTheme } = useTheme();
  const { user, setupNewVault, logout, pendingRecoveryKey, confirmRecoveryKeySaved } =
    useVault();

  const [vaultName, setVaultName] = useState('Personal Vault');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showMaster, setShowMaster] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedRecovery, setCopiedRecovery] = useState(false);
  const [savedChecked, setSavedChecked] = useState(false);

  const strength = useMemo(
    () => evaluatePasswordStrength(masterPassword),
    [masterPassword],
  );

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (masterPassword.length < 8) {
      setError('Master Password must be at least 8 characters.');
      return;
    }
    if (masterPassword !== confirmPassword) {
      setError('Master passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await setupNewVault(masterPassword, vaultName.trim() || 'Personal Vault');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize vault.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyRecovery = async () => {
    if (!pendingRecoveryKey) return;
    await navigator.clipboard.writeText(pendingRecoveryKey);
    setCopiedRecovery(true);
    window.setTimeout(() => setCopiedRecovery(false), 2500);
  };

  const handleDownloadRecovery = () => {
    if (!pendingRecoveryKey) return;
    const content = [
      'KEYNEST RECOVERY KEY — STORE OFFLINE IN A SAFE PLACE',
      `Account: ${user?.email ?? ''}`,
      `Created: ${new Date().toISOString()}`,
      '',
      `Recovery Key: ${pendingRecoveryKey}`,
      '',
      'Warning: Anyone with this Recovery Key can unwrap your Vault Encryption Key.',
      'KeyNest cannot reset or recover your Master Password if you lose both.',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keynest-recovery-key.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (pendingRecoveryKey) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F4F7FA] px-4 py-10 dark:bg-[#0F141A]">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-md dark:border-[#24303F] dark:bg-[#161D26]">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Save Your Emergency Recovery Key
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Shown only once. Required if you ever forget your Master Password.
              </p>
            </div>
          </div>

          <div className="my-5 rounded-xl border border-teal-300 bg-teal-50/50 p-4 dark:border-teal-500/30 dark:bg-[#0F141A]">
            <p className="mb-2 text-[11px] font-bold tracking-wider text-teal-700 uppercase dark:text-teal-400">
              256-Bit Recovery Key
            </p>
            <p className="font-mono text-sm leading-relaxed break-all text-slate-900 select-all dark:text-slate-100">
              {pendingRecoveryKey}
            </p>
          </div>

          <div className="mb-5 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleCopyRecovery}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-[#2C3A4B] dark:bg-[#1E2733] dark:text-slate-200"
            >
              {copiedRecovery ? (
                <>
                  <Check className="h-3.5 w-3.5 text-teal-600" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy Key
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadRecovery}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-[#2C3A4B] dark:bg-[#1E2733] dark:text-slate-200"
            >
              <Download className="h-3.5 w-3.5" /> Download .txt
            </button>
          </div>

          <label className="mb-5 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 dark:border-[#273342] dark:bg-[#0F141A] dark:text-slate-300">
            <input
              type="checkbox"
              checked={savedChecked}
              onChange={(e) => setSavedChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-teal-600"
            />
            <span>
              I have saved my Recovery Key in a secure offline location and understand KeyNest cannot recover my Master Password without it.
            </span>
          </label>

          <button
            type="button"
            disabled={!savedChecked}
            onClick={confirmRecoveryKeySaved}
            className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Enter KeyNest Vault
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#F4F7FA] px-4 py-10 dark:bg-[#0F141A]">
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white dark:bg-teal-600/25 dark:text-teal-400 dark:ring-1 dark:ring-teal-500/40">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">
                Initialize Your Vault
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 dark:border-[#273342] dark:bg-[#161D26] dark:text-slate-300"
            >
              {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5 text-amber-400" />}
            </button>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 dark:border-[#273342] dark:bg-[#161D26] dark:text-slate-300 dark:hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#24303F] dark:bg-[#161D26]">
          <form onSubmit={handleSetup} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                Vault Name
              </label>
              <input
                type="text"
                value={vaultName}
                onChange={(e) => setVaultName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                Master Password
              </label>
              <div className="relative">
                <input
                  type={showMaster ? 'text' : 'password'}
                  required
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  placeholder="Create a strong Master Password"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pr-10 pl-3 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowMaster((v) => !v)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showMaster ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {masterPassword.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      Strength:{' '}
                      <span
                        className={`font-semibold ${
                          strength.score >= 4
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : strength.score === 3
                              ? 'text-teal-600 dark:text-teal-400'
                              : strength.score === 2
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {strength.label}
                      </span>
                    </span>
                    <span className="tabular-nums text-slate-400">
                      ~{strength.entropyBits} bits
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-[#1E2733]">
                    <div
                      className={`h-full transition-all ${
                        strength.score >= 4
                          ? 'w-full bg-emerald-500'
                          : strength.score === 3
                            ? 'w-3/4 bg-teal-500'
                            : strength.score === 2
                              ? 'w-1/2 bg-amber-500'
                              : 'w-1/4 bg-red-500'
                      }`}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                Confirm Master Password
              </label>
              <input
                type={showMaster ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter Master Password"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:opacity-50"
            >
              {loading
                ? 'Generating 256-bit Vault Key (Argon2id)...'
                : 'Create Zero-Knowledge Vault'}
            </button>
          </form>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-[#0F141A] dark:text-slate-300">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
            <span>
              Generates a random 256-bit Vault Encryption Key (VEK), wrapped locally via Argon2id + AES-256-GCM.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
