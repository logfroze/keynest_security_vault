'use client';

import React, { useState } from 'react';
import {
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useTheme } from '../providers/ThemeProvider';
import { useVault } from '../providers/VaultProvider';

export function AuthScreen({ defaultMode = 'register' }: { defaultMode?: 'login' | 'register' }) {
  const { theme, toggleTheme } = useTheme();
  const { backendMode, login, register } = useVault();
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);
  const [email, setEmail] = useState('logfroze@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      if (mode === 'register') {
        const res = await register(email, password);
        if (res.requiresEmailConfirmation) {
          setInfoMessage(
            'Account created. Check your inbox to confirm your email address, then sign in.',
          );
          setMode('login');
        }
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#F4F7FA] px-4 py-10 dark:bg-[#0F141A]">
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-5 right-5 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-xs hover:text-slate-900 dark:border-[#273342] dark:bg-[#161D26] dark:text-slate-300 dark:hover:text-white"
        title="Toggle Theme"
      >
        {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4 text-amber-400" />}
      </button>

      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-sm dark:bg-teal-600/25 dark:text-teal-400 dark:ring-1 dark:ring-teal-500/40">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            KeyNest
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Your private, zero-knowledge personal vault.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
          <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
            <Database className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <span>
              {backendMode === 'supabase'
                ? 'Supabase Cloud Sync Connected'
                : 'Local Encrypted Storage Mode'}
            </span>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 font-semibold ${
              backendMode === 'supabase'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                : 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300'
            }`}
          >
            {backendMode === 'supabase' ? 'Cloud' : 'Local ZK'}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#24303F] dark:bg-[#161D26]">
          <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-[#0F141A]">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`rounded-lg py-2 text-xs font-semibold transition ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-[#1E2733] dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`rounded-lg py-2 text-xs font-semibold transition ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-[#1E2733] dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                Email Address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="logfroze@gmail.com"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pr-3 pl-9 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                Account Login Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pr-10 pl-9 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Identifies your account only. In the next step, your separate Master Password encrypts your vault locally.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </div>
            )}

            {infoMessage && (
              <div className="rounded-xl border border-teal-300 bg-teal-50 px-3 py-2.5 text-xs text-teal-800 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-200">
                {infoMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:opacity-50"
            >
              {loading
                ? 'Authenticating...'
                : mode === 'register'
                  ? 'Continue to Vault Setup'
                  : 'Sign In to KeyNest'}
            </button>
          </form>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-xs dark:border-[#24303F] dark:bg-[#161D26] dark:text-slate-300">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
          <p>
            <strong className="font-semibold text-slate-900 dark:text-white">
              Zero-Knowledge Design:
            </strong>{' '}
            Your Master Password and secrets never leave your device unencrypted.
          </p>
        </div>
      </div>
    </div>
  );
}
