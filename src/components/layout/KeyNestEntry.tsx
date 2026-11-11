'use client';

import React from 'react';
import { KeyRound } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useVault } from '@/components/providers/VaultProvider';
import { AuthScreen } from '@/components/security/AuthScreen';
import { VaultSetupScreen } from '@/components/security/VaultSetupScreen';
import { VaultUnlockScreen } from '@/components/security/VaultUnlockScreen';

export function KeyNestEntry({
  initialTab = 'home',
  initialAuthMode = 'register',
  initialUnlockMode = 'master',
}: {
  initialTab?: 'home' | 'vault' | 'ai' | 'settings';
  initialAuthMode?: 'login' | 'register';
  initialUnlockMode?: 'master' | 'recovery';
}) {
  const { authStatus, vaultStatus, pendingRecoveryKey } = useVault();

  if (authStatus === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F4F7FA] text-slate-500 dark:bg-[#0F141A] dark:text-slate-400">
        <div className="mb-3 flex h-11 w-11 animate-pulse items-center justify-center rounded-2xl bg-teal-600 text-white dark:bg-teal-600/20 dark:text-teal-400 dark:ring-1 dark:ring-teal-500/40">
          <KeyRound className="h-5 w-5" />
        </div>
        <p className="text-xs font-medium">Loading KeyNest Vault...</p>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return <AuthScreen defaultMode={initialAuthMode} />;
  }

  if (vaultStatus === 'needs_setup' || pendingRecoveryKey) {
    return <VaultSetupScreen />;
  }

  if (vaultStatus === 'locked') {
    return <VaultUnlockScreen defaultMode={initialUnlockMode} />;
  }

  return <AppShell initialTab={initialTab} />;
}

