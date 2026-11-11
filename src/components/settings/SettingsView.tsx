'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  Cloud,
  Database,
  Download,
  Fingerprint,
  Grid3X3,
  KeyRound,
  Laptop,
  LifeBuoy,
  LogOut,
  Moon,
  Shield,
  Smartphone,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import type { EncryptedVaultBackupFile } from '@/modules/security/backup';
import { formatRelativeTime } from '@/modules/security/securityUtils';
import { usePwa } from '../providers/PwaProvider';
import { useTheme } from '../providers/ThemeProvider';
import { useVault } from '../providers/VaultProvider';
import { InstallAppButton } from '../pwa/InstallAppButton';
import { QuickPinModal } from '../security/QuickPinModal';
import { RecoveryBannerModal } from '../security/RecoveryBannerModal';

export function SettingsView({
  cloudApiKey,
  onChangeCloudApiKey,
}: {
  cloudApiKey: string;
  onChangeCloudApiKey: (val: string) => void;
}) {
  const { theme, setTheme } = useTheme();
  const { swRegistered, isStandalone } = usePwa();
  const {
    backendMode,
    user,
    profile,
    passkeys,
    recoveryConfig,
    deviceSessions,
    securityEvents,
    webAuthnAvailable,
    hasQuickPin,
    updatePreferences,
    changeMasterPassword,
    regenerateRecoveryKey,
    enrollPasskey,
    removePasskey,
    setupQuickPin,
    disableQuickPin,
    revokeSession,
    createEncryptedBackup,
    importEncryptedBackup,
    logout,
    notify,
  } = useVault();

  const [currMaster, setCurrMaster] = useState('');
  const [newMaster, setNewMaster] = useState('');
  const [confirmMaster, setConfirmMaster] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const [passkeyLabel, setPasskeyLabel] = useState('This Device Passkey');
  const [pkBusy, setPkBusy] = useState(false);

  const [rotatedRecoveryKey, setRotatedRecoveryKey] = useState<string | null>(null);
  const [recBusy, setRecBusy] = useState(false);

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);

  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [serverGeminiConfigured, setServerGeminiConfigured] = useState(false);

  useEffect(() => {
    fetch('/api/ai/copilot')
      .then((r) => r.json())
      .then((d: { serverGeminiConfigured?: boolean }) =>
        setServerGeminiConfigured(Boolean(d.serverGeminiConfigured)),
      )
      .catch(() => null);
  }, []);

  const prefs = profile?.preferences;

  const handleChangeMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMaster !== confirmMaster) {
      notify('New master passwords do not match.', 'danger');
      return;
    }
    setPwBusy(true);
    try {
      await changeMasterPassword(currMaster, newMaster);
      setCurrMaster('');
      setNewMaster('');
      setConfirmMaster('');
      notify('Master Password rotated. Existing items remain encrypted with your VEK.', 'teal');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to rotate password.', 'danger');
    } finally {
      setPwBusy(false);
    }
  };

  const handleEnrollPasskey = async () => {
    setPkBusy(true);
    try {
      await enrollPasskey(passkeyLabel);
      notify('Passkey PRF unlock enrolled successfully.', 'teal');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Passkey enrollment failed.', 'warning');
    } finally {
      setPkBusy(false);
    }
  };

  const handleRotateRecovery = async () => {
    setRecBusy(true);
    try {
      const nextKey = await regenerateRecoveryKey();
      setRotatedRecoveryKey(nextKey);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to rotate recovery key.', 'danger');
    } finally {
      setRecBusy(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const bundle = await createEncryptedBackup(backupPassphrase || undefined);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `keynest-backup-${new Date().toISOString().slice(0, 10)}.keynest.enc.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify(`Exported ${bundle.itemCount} encrypted item(s).`, 'teal');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Backup export failed.', 'danger');
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as EncryptedVaultBackupFile;
      const imported = await importEncryptedBackup(
        parsed,
        restorePassphrase || undefined,
      );
      notify(`Restored ${imported} encrypted record(s) into your vault.`, 'teal');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to restore backup.', 'danger');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      {rotatedRecoveryKey && (
        <RecoveryBannerModal
          recoveryKey={rotatedRecoveryKey}
          email={user?.email ?? ''}
          onClose={() => setRotatedRecoveryKey(null)}
        />
      )}

      {/* Account & Theme */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Account, Sync &amp; Theme
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Signed in as <span className="font-medium text-slate-900 dark:text-white">{user?.email}</span> ·{' '}
                {backendMode === 'supabase'
                  ? 'Supabase PostgreSQL + Realtime Sync'
                  : 'Local Encrypted IndexedDB Mode'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-[#2C3A4B] dark:bg-[#0F141A]">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <Sun className="h-3.5 w-3.5 text-amber-500" /> Light
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  theme === 'dark'
                    ? 'bg-[#1E2733] text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <Moon className="h-3.5 w-3.5 text-teal-400" /> Dark
              </button>
            </div>

            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:border-red-300 hover:text-red-600 dark:border-[#2C3A4B] dark:bg-[#1E2733] dark:text-slate-200 dark:hover:text-red-300"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </section>

      {/* Installable Web App (PWA) & Multi-Device Access */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Installable PWA &amp; Multi-Device Sync
              </h2>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                Service Worker:{' '}
                <strong className={swRegistered ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}>
                  {swRegistered ? 'Active (Zero-Knowledge Safe)' : 'Registering...'}
                </strong>{' '}
                · Mode: {isStandalone ? 'Installed App' : 'Browser Tab'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Install KeyNest as an app on Windows/macOS/Android (Chrome/Edge menu → Install KeyNest) or iOS Safari (Share → Add to Home Screen). To use across phones &amp; laptops anywhere, host on HTTPS (e.g., GitHub + Vercel).
              </p>
            </div>
          </div>

          <InstallAppButton variant="card" />
        </div>
      </section>

      {/* Security & Privacy Controls */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
        <div className="mb-4 flex items-center gap-2">
          <Shield className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Security &amp; Privacy Controls
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Auto-Lock Inactivity Timeout
            </label>
            <select
              value={prefs?.autoLockMinutes ?? 5}
              onChange={(e) =>
                updatePreferences({ autoLockMinutes: Number(e.target.value) })
              }
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
            >
              <option value={1}>1 minute</option>
              <option value={5}>5 minutes (Recommended)</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={0}>Never (Manual lock only)</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Clear Clipboard Automatically
            </label>
            <select
              value={prefs?.clipboardClearSeconds ?? 30}
              onChange={(e) =>
                updatePreferences({ clipboardClearSeconds: Number(e.target.value) })
              }
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
            >
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds (Recommended)</option>
              <option value={60}>60 seconds</option>
              <option value={0}>Off</option>
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-[#273342] dark:bg-[#0F141A]">
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                Confirm Before Revealing Financial / Payment Secrets
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Adds an explicit confirmation prompt before exposing IBANs or card numbers.
              </p>
            </div>
            <input
              type="checkbox"
              checked={prefs?.confirmSensitiveReveal ?? true}
              onChange={(e) =>
                updatePreferences({ confirmSensitiveReveal: e.target.checked })
              }
              className="h-4 w-4 accent-teal-600"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-[#273342] dark:bg-[#0F141A]">
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                Enable Cards &amp; Payment Category
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Optional category for storing payment cards with extra reveal confirmation.
              </p>
            </div>
            <input
              type="checkbox"
              checked={prefs?.enablePaymentCategory ?? false}
              onChange={(e) =>
                updatePreferences({ enablePaymentCategory: e.target.checked })
              }
              className="h-4 w-4 accent-teal-600"
            />
          </label>
        </div>
      </section>

      {/* Master Password + Recovery Key */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
          <div className="mb-3 flex items-center gap-2">
            <KeyRound className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Change Master Password
            </h2>
          </div>
          <p className="mb-4 text-xs text-slate-600 dark:text-slate-300">
            Re-wraps your 256-bit Vault Key without re-encrypting every record.
          </p>
          <form onSubmit={handleChangeMaster} className="space-y-3">
            <input
              type="password"
              required
              value={currMaster}
              onChange={(e) => setCurrMaster(e.target.value)}
              placeholder="Current Master Password"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
            />
            <input
              type="password"
              required
              minLength={8}
              value={newMaster}
              onChange={(e) => setNewMaster(e.target.value)}
              placeholder="New Master Password (min 8 chars)"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
            />
            <input
              type="password"
              required
              value={confirmMaster}
              onChange={(e) => setConfirmMaster(e.target.value)}
              placeholder="Confirm New Master Password"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
            />
            <button
              type="submit"
              disabled={pwBusy}
              className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
            >
              {pwBusy ? 'Re-wrapping VEK...' : 'Update Master Password'}
            </button>
          </form>
        </section>

        <section className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <LifeBuoy className="h-4.5 w-4.5 text-amber-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Recovery Key
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Your recovery envelope lets you restore vault access if both Master Password and Passkey are lost.
            </p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-[#273342] dark:bg-[#0F141A]">
              <p className="text-slate-500 dark:text-slate-400">Active Key Fingerprint</p>
              <p className="mt-1 font-mono text-sm font-semibold text-teal-700 dark:text-teal-300">
                {recoveryConfig?.keyFingerprint ?? 'Configured'}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={recBusy}
            onClick={handleRotateRecovery}
            className="mt-4 w-full rounded-xl border border-amber-300 bg-amber-50 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
          >
            {recBusy ? 'Generating...' : 'Regenerate Recovery Key'}
          </button>
        </section>
      </div>

      {/* Quick PIN Unlock (4-Digit Code) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Grid3X3 className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Quick PIN Unlock (4-Digit Code)
            </h2>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              hasQuickPin
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30'
                : 'bg-slate-100 text-slate-600 dark:bg-[#1E2733] dark:text-slate-400'
            }`}
          >
            {hasQuickPin ? 'Active on this device' : 'Not configured'}
          </span>
        </div>

        <p className="mb-4 text-xs text-slate-600 dark:text-slate-300">
          After logging in once with your email and password, use a 4-digit PIN on this device instead of your Master Password until you manually Sign Out. Encrypted strictly in local device storage with Argon2id + AES-256-GCM and cleared automatically after 5 wrong attempts.
        </p>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={pinBusy}
            onClick={() => setShowPinModal(true)}
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-50"
          >
            {hasQuickPin ? 'Change 4-Digit PIN' : 'Enable 4-Digit Quick PIN'}
          </button>
          {hasQuickPin && (
            <button
              type="button"
              disabled={pinBusy}
              onClick={async () => {
                setPinBusy(true);
                try {
                  await disableQuickPin();
                  notify('Quick PIN removed from this device.', 'warning');
                } finally {
                  setPinBusy(false);
                }
              }}
              className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
            >
              {pinBusy ? 'Removing...' : 'Remove PIN'}
            </button>
          )}
        </div>
      </section>

      {/* Passkey Unlock */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Passkey Unlock (WebAuthn PRF)
            </h2>
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {webAuthnAvailable ? 'WebAuthn Available' : 'WebAuthn Unavailable'}
          </span>
        </div>

        <p className="mb-4 text-xs text-slate-600 dark:text-slate-300">
          Registers a hardware/platform passkey using the WebAuthn PRF extension to wrap your Vault Key. Unsupported authenticators fall back safely to Master Password.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          <input
            type="text"
            value={passkeyLabel}
            onChange={(e) => setPasskeyLabel(e.target.value)}
            placeholder="Passkey label (e.g. Windows Hello, YubiKey)"
            className="min-w-[200px] flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
          />
          <button
            type="button"
            disabled={!webAuthnAvailable || pkBusy}
            onClick={handleEnrollPasskey}
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
          >
            {pkBusy ? 'Waiting for Passkey...' : 'Enroll Passkey'}
          </button>
        </div>

        {passkeys.length > 0 && (
          <div className="space-y-2">
            {passkeys.map((pk) => (
              <div
                key={pk.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs dark:border-[#273342] dark:bg-[#0F141A]"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{pk.label}</p>
                  <p className="text-slate-500 dark:text-slate-400">
                    Added {new Date(pk.createdAt).toLocaleDateString()} · PRF Enabled
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removePasskey(pk)}
                  className="text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Encrypted Backup */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
        <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">
          Encrypted Backup &amp; Portability
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#273342] dark:bg-[#0F141A]">
            <p className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Export Encrypted Archive
            </p>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Optionally set a dedicated backup passphrase, or leave blank to encrypt with your Vault Export subkey.
            </p>
            <input
              type="password"
              value={backupPassphrase}
              onChange={(e) => setBackupPassphrase(e.target.value)}
              placeholder="Optional backup passphrase"
              className="mb-2.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#161D26] dark:text-white"
            />
            <button
              type="button"
              onClick={handleExportBackup}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-xs font-semibold text-teal-700 ring-1 ring-slate-200 hover:ring-teal-400 dark:bg-[#161D26] dark:text-teal-300 dark:ring-[#2C3A4B]"
            >
              <Download className="h-3.5 w-3.5" /> Download .keynest.enc.json
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#273342] dark:bg-[#0F141A]">
            <p className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Restore Encrypted Archive
            </p>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Enter the backup passphrase if the archive was passphrase-protected, then select the file.
            </p>
            <input
              type="password"
              value={restorePassphrase}
              onChange={(e) => setRestorePassphrase(e.target.value)}
              placeholder="Backup passphrase (if set)"
              className="mb-2.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-[#2C3A4B] dark:bg-[#161D26] dark:text-white"
            />
            <label className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:text-slate-900 dark:bg-[#161D26] dark:text-slate-200 dark:ring-[#2C3A4B]">
              <Upload className="h-3.5 w-3.5" /> Restore Backup File
              <input
                type="file"
                accept=".json"
                onChange={handleRestoreFile}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </section>

      {/* Optional Cloud AI (Zero-Knowledge Redacted) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cloud className="h-4.5 w-4.5 text-sky-600 dark:text-sky-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Gemini Cloud Copilot (Secret-Redacted)
            </h2>
          </div>
          <input
            type="checkbox"
            checked={prefs?.cloudAiEnabled ?? false}
            onChange={(e) =>
              updatePreferences({ cloudAiEnabled: e.target.checked })
            }
            className="h-4 w-4 accent-teal-600"
          />
        </div>
        <p className="mb-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {serverGeminiConfigured
            ? 'Server GEMINI_API_KEY is configured in .env.local. Only non-secret vault metadata (titles, URLs, categories, strength scores) is shared when you switch KeyNest Copilot to Gemini mode — passwords and keys never leave your browser.'
            : 'Using Local Zero-Knowledge AI by default. To enable Gemini Copilot, set your own GEMINI_API_KEY in .env.local (recommended) or paste a session-only key below. Only secret-redacted metadata is ever sent.'}
        </p>

        {prefs?.cloudAiEnabled && (
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={prefs.cloudAiProvider ?? 'gemini'}
              onChange={(e) =>
                updatePreferences({
                  cloudAiProvider: e.target.value as 'gemini' | 'openai',
                })
              }
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
            </select>
            <input
              type="password"
              value={cloudApiKey}
              onChange={(e) => onChangeCloudApiKey(e.target.value)}
              placeholder="Optional session BYOK key (memory only)"
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-teal-500 sm:col-span-2 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-white"
            />
          </div>
        )}
      </section>

      {/* Devices & Security Audit Log */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
          <div className="mb-3 flex items-center gap-2">
            <Laptop className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Registered Devices
            </h2>
          </div>
          <div className="space-y-2">
            {deviceSessions.length === 0 ? (
              <p className="text-xs text-slate-500">No devices recorded yet.</p>
            ) : (
              deviceSessions.map((sess) => (
                <div
                  key={sess.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs dark:border-[#273342] dark:bg-[#0F141A]"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {sess.deviceLabel}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400">
                      {sess.revokedAt
                        ? 'Revoked'
                        : `Active · ${formatRelativeTime(sess.lastSeenAt)}`}
                    </p>
                  </div>
                  {!sess.revokedAt && (
                    <button
                      type="button"
                      onClick={() => revokeSession(sess.id)}
                      className="font-medium text-red-600 hover:underline dark:text-red-400"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#24303F] dark:bg-[#161D26]">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Security Events
            </h2>
          </div>
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {securityEvents.length === 0 ? (
              <p className="text-xs text-slate-500">No security events logged yet.</p>
            ) : (
              securityEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs dark:border-[#273342] dark:bg-[#0F141A]"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {ev.eventType.replace(/_/g, ' ')}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400">
                      {ev.deviceLabel ?? 'Device'}
                    </p>
                  </div>
                  <span className="text-slate-500 dark:text-slate-400">
                    {formatRelativeTime(ev.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {showPinModal && (
        <QuickPinModal
          isChanging={hasQuickPin}
          onClose={() => setShowPinModal(false)}
          onSave={async (pin) => {
            await setupQuickPin(pin);
            notify(
              hasQuickPin
                ? 'Quick PIN updated for this device.'
                : '4-Digit Quick PIN enabled on this device.',
              'teal',
            );
          }}
        />
      )}
    </div>
  );
}
