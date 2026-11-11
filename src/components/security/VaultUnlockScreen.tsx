'use client';

import React, { useState } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  LifeBuoy,
  Lock,
  LogOut,
  Moon,
  Shield,
  Sun,
} from 'lucide-react';
import { useTheme } from '../providers/ThemeProvider';
import { useVault } from '../providers/VaultProvider';

export function VaultUnlockScreen({
  defaultMode = 'master',
}: {
  defaultMode?: 'master' | 'recovery';
}) {
  const { theme, toggleTheme } = useTheme();
  const {
    user,
    vault,
    encryptedCount,
    hasPasskeyEnvelope,
    webAuthnAvailable,
    unlockWithMaster,
    unlockWithRecovery,
    unlockWithPasskey,
    logout,
  } = useVault();

  const [mode, setMode] = useState<'master' | 'recovery'>(defaultMode);
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'master') {
        await unlockWithMaster(secret);
      } else {
        await unlockWithRecovery(secret);
      }
      setSecret('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to unlock vault.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyUnlock = async () => {
    setError(null);
    setLoading(true);
    try {
      await unlockWithPasskey();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey unlock failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F4F7FA] px-4 py-10 dark:bg-[#0F141A]">
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white dark:bg-teal-600/25 dark:text-teal-400 dark:ring-1 dark:ring-teal-500/40">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">
                {vault?.name ?? 'KeyNest Vault'}
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
          <div className="mb-5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
              <Lock className="h-3.5 w-3.5" /> Vault Locked
            </span>
            <span className="tabular-nums text-xs font-medium text-slate-500 dark:text-slate-400">
              {encryptedCount} encrypted record{encryptedCount === 1 ? '' : 's'}
            </span>
          </div>

          {mode === 'master' ? (
            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Master Password
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    autoFocus
                    required
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="Enter your Master Password"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pr-10 pl-3 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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
                {loading ? 'Deriving Key (Argon2id)...' : 'Unlock Vault'}
              </button>

              {hasPasskeyEnvelope && webAuthnAvailable && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handlePasskeyUnlock}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-teal-400 dark:border-[#2C3A4B] dark:bg-[#1E2733] dark:text-slate-100"
                >
                  <Fingerprint className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Unlock with Passkey
                </button>
              )}

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode('recovery');
                    setSecret('');
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400"
                >
                  <LifeBuoy className="h-3.5 w-3.5" />
                  Forgot Master Password? Use Recovery Key
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                  Recovery Key Unlock
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('master');
                    setSecret('');
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  256-Bit Recovery Key
                </label>
                <textarea
                  rows={3}
                  required
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="KNST-XXXX-XXXX-XXXX-..."
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
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
                {loading ? 'Unwrapping Vault Key...' : 'Recover & Unlock Vault'}
              </button>
            </form>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Shield className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
          <span>Decryption occurs strictly inside browser memory.</span>
        </div>
      </div>
    </div>
  );
}
