'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Delete,
  Eye,
  EyeOff,
  Fingerprint,
  Grid3X3,
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
import { InstallAppButton } from '../pwa/InstallAppButton';

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

export function VaultUnlockScreen({
  defaultMode = 'master',
}: {
  defaultMode?: 'pin' | 'master' | 'recovery';
}) {
  const { theme, toggleTheme } = useTheme();
  const {
    user,
    vault,
    encryptedCount,
    hasPasskeyEnvelope,
    hasQuickPin,
    webAuthnAvailable,
    unlockWithMaster,
    unlockWithRecovery,
    unlockWithPasskey,
    unlockWithPin,
    logout,
  } = useVault();

  const [mode, setMode] = useState<'pin' | 'master' | 'recovery'>(
    hasQuickPin && defaultMode === 'master' ? 'pin' : defaultMode,
  );
  const [userChoseOtherMode, setUserChoseOtherMode] = useState(false);
  const [pin, setPin] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasQuickPin && !userChoseOtherMode && defaultMode === 'master') {
      setMode('pin');
    } else if (!hasQuickPin && mode === 'pin') {
      setMode('master');
      setPin('');
    }
  }, [hasQuickPin, userChoseOtherMode, defaultMode, mode]);

  const submitPin = useCallback(
    async (candidate: string) => {
      setError(null);
      setLoading(true);
      try {
        await unlockWithPin(candidate);
        setPin('');
      } catch (err) {
        setPin('');
        setError(err instanceof Error ? err.message : 'Incorrect PIN.');
      } finally {
        setLoading(false);
      }
    },
    [unlockWithPin],
  );

  const handlePinDigit = useCallback(
    (digit: string) => {
      if (loading || pin.length >= 4) return;
      setError(null);
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) {
        void submitPin(next);
      }
    },
    [loading, pin, submitPin],
  );

  const handlePinBackspace = useCallback(() => {
    if (loading) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }, [loading]);

  useEffect(() => {
    if (mode !== 'pin') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        handlePinBackspace();
        return;
      }
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        handlePinDigit(e.key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, handlePinBackspace, handlePinDigit]);

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
            <InstallAppButton variant="compact" />
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

          {mode === 'pin' ? (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Enter 4-Digit Quick PIN
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {loading
                    ? 'Verifying Quick PIN (Argon2id)...'
                    : 'Type or tap your 4-digit PIN to unlock'}
                </p>
              </div>

              <div className="flex items-center justify-center gap-3.5 py-1">
                {[0, 1, 2, 3].map((idx) => {
                  const filled = idx < pin.length;
                  return (
                    <div
                      key={idx}
                      className={`flex h-12 w-12 items-center justify-center rounded-xl border transition ${
                        filled
                          ? 'border-teal-500 bg-teal-50 dark:border-teal-400 dark:bg-teal-500/15'
                          : 'border-slate-300 bg-slate-50 dark:border-[#2C3A4B] dark:bg-[#0F141A]'
                      }`}
                    >
                      <span
                        className={`h-3 w-3 rounded-full transition ${
                          filled
                            ? 'scale-100 bg-teal-600 dark:bg-teal-400'
                            : 'scale-75 bg-slate-300 dark:bg-slate-700'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              {error && (
                <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-center text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2.5">
                {KEYPAD_ROWS.flat().map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    disabled={loading}
                    onClick={() => handlePinDigit(digit)}
                    className="flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-base font-semibold text-slate-900 transition hover:border-teal-400 hover:bg-white active:scale-95 disabled:opacity-50 dark:border-[#273342] dark:bg-[#0F141A] dark:text-white dark:hover:border-teal-500/50 dark:hover:bg-[#1A222D]"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={loading || pin.length === 0}
                  onClick={() => {
                    setPin('');
                    setError(null);
                  }}
                  className="flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-35 dark:border-[#273342] dark:bg-[#161D26] dark:text-slate-300 dark:hover:bg-[#1E2733]"
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handlePinDigit('0')}
                  className="flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-base font-semibold text-slate-900 transition hover:border-teal-400 hover:bg-white active:scale-95 disabled:opacity-50 dark:border-[#273342] dark:bg-[#0F141A] dark:text-white dark:hover:border-teal-500/50 dark:hover:bg-[#1A222D]"
                >
                  0
                </button>
                <button
                  type="button"
                  disabled={loading || pin.length === 0}
                  onClick={handlePinBackspace}
                  aria-label="Backspace"
                  className="flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 active:scale-95 disabled:opacity-35 dark:border-[#273342] dark:bg-[#161D26] dark:text-slate-300 dark:hover:bg-[#1E2733]"
                >
                  <Delete className="h-4.5 w-4.5" />
                </button>
              </div>

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

              <div className="flex flex-wrap items-center justify-center gap-4 pt-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setUserChoseOtherMode(true);
                    setMode('master');
                    setPin('');
                    setError(null);
                  }}
                  className="font-medium text-slate-600 transition hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400"
                >
                  Use Master Password
                </button>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <button
                  type="button"
                  onClick={() => {
                    setUserChoseOtherMode(true);
                    setMode('recovery');
                    setPin('');
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1 font-medium text-slate-600 transition hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400"
                >
                  <LifeBuoy className="h-3.5 w-3.5" />
                  Recovery Key
                </button>
              </div>
            </div>
          ) : mode === 'master' ? (
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

              {hasQuickPin && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setUserChoseOtherMode(false);
                    setMode('pin');
                    setSecret('');
                    setError(null);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-teal-300 bg-teal-50 py-2.5 text-sm font-semibold text-teal-800 transition hover:bg-teal-100 dark:border-teal-500/35 dark:bg-teal-500/15 dark:text-teal-300 dark:hover:bg-teal-500/25"
                >
                  <Grid3X3 className="h-4 w-4" />
                  Unlock with 4-Digit Quick PIN
                </button>
              )}

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
                    setUserChoseOtherMode(true);
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
                    setUserChoseOtherMode(false);
                    setMode(hasQuickPin ? 'pin' : 'master');
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
