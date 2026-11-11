'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  decryptAesGcmWithKey,
  deriveSubkeyHkdf,
  encryptAesGcmWithKey,
  zeroizeBytes,
} from '@/modules/cryptography/cryptoEngine';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  utf8ToBytes,
} from '@/modules/cryptography/encoding';
import {
  initializeVaultKeys,
  rotateMasterPassword,
  rotateRecoveryKey,
  unlockWithMasterPassword,
  unlockWithRecoveryKey,
} from '@/modules/key-management/keyManager';
import {
  isWebAuthnSupported,
  registerPasskeyWithPrf,
  unlockWithPasskeyPrf,
} from '@/modules/key-management/passkey';
import {
  disableQuickPinOnDevice,
  enableQuickPinOnDevice,
  hasQuickPinOnDevice,
  QuickPinWipedError,
  unlockWithQuickPinOnDevice,
} from '@/modules/key-management/quickPin';
import {
  exportEncryptedVaultBackup,
  restoreEncryptedVaultBackup,
  type EncryptedVaultBackupFile,
} from '@/modules/security/backup';
import { copySecretWithAutoClear } from '@/modules/security/securityUtils';
import {
  deletePasskeyEnrollment,
  getCurrentAuthenticatedUser,
  getStorageBackendMode,
  loadUserVaultState,
  OptimisticConcurrencyError,
  persistInitialVaultSetup,
  persistPasskeyEnrollment,
  purgeEncryptedVaultItem,
  recordSecurityEvent,
  registerCurrentDeviceSession,
  replaceMethodEnvelope,
  revokeDeviceSessionRecord,
  saveEncryptedVaultItem,
  saveUserPreferences,
  signInAccount,
  signOutAccount,
  signUpAccount,
  subscribeToVaultRealtime,
  updateRecoveryFingerprint,
} from '@/modules/synchronization/vaultRepository';
import {
  createEncryptedVaultItem,
  decryptVaultItem,
  decryptVaultItems,
  generateUuid,
  updateEncryptedVaultItem,
} from '@/modules/vault/vaultManager';
import {
  clearAllLocalPinEnvelopes,
  DEFAULT_PREFERENCES,
  deleteEncryptedAiConversation,
  getEncryptedAiConversations,
  putEncryptedAiConversation,
} from '@/lib/storage/indexedDbStore';
import type {
  AiConversationThread,
  DecryptedVaultItem,
  DeviceSessionRecord,
  EncryptedVaultItemRecord,
  PasskeyCredentialRecord,
  RecoveryConfigRecord,
  SecurityEventRecord,
  StorageBackendMode,
  SyncConflict,
  UserPreferences,
  UserProfile,
  VaultItemPayload,
  VaultKeyEnvelope,
  VaultMetadata,
} from '@/types/vault';

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';
export type VaultStatus = 'needs_setup' | 'locked' | 'unlocked';

interface ToastNotification {
  id: string;
  message: string;
  tone: 'teal' | 'warning' | 'danger';
}

interface VaultContextValue {
  backendMode: StorageBackendMode;
  authStatus: AuthStatus;
  vaultStatus: VaultStatus;
  user: { id: string; email: string } | null;
  profile: UserProfile | null;
  vault: VaultMetadata | null;
  envelopes: VaultKeyEnvelope[];
  items: DecryptedVaultItem[];
  encryptedCount: number;
  passkeys: PasskeyCredentialRecord[];
  recoveryConfig: RecoveryConfigRecord | null;
  deviceSessions: DeviceSessionRecord[];
  securityEvents: SecurityEventRecord[];
  conflicts: SyncConflict[];
  pendingRecoveryKey: string | null;
  webAuthnAvailable: boolean;
  hasPasskeyEnvelope: boolean;
  hasQuickPin: boolean;
  clipboardCountdown: number | null;
  toasts: ToastNotification[];
  notify: (message: string, tone?: ToastNotification['tone']) => void;
  dismissToast: (id: string) => void;
  // Auth
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
  ) => Promise<{ requiresEmailConfirmation?: boolean }>;
  logout: () => Promise<void>;
  // Vault Setup & Unlock
  setupNewVault: (masterPassword: string, vaultName?: string) => Promise<string>;
  confirmRecoveryKeySaved: () => void;
  unlockWithMaster: (masterPassword: string) => Promise<void>;
  unlockWithRecovery: (recoveryKey: string) => Promise<void>;
  unlockWithPasskey: () => Promise<void>;
  unlockWithPin: (pin: string) => Promise<void>;
  setupQuickPin: (pin: string) => Promise<void>;
  disableQuickPin: () => Promise<void>;
  lockVault: () => void;
  // CRUD
  createItem: (payload: VaultItemPayload) => Promise<DecryptedVaultItem>;
  bulkCreateItems: (payloads: VaultItemPayload[]) => Promise<DecryptedVaultItem[]>;
  updateItem: (
    existing: DecryptedVaultItem,
    nextPayload: VaultItemPayload,
  ) => Promise<DecryptedVaultItem>;
  softDeleteItem: (item: DecryptedVaultItem) => Promise<void>;
  restoreItem: (item: DecryptedVaultItem) => Promise<void>;
  purgeItem: (itemId: string) => Promise<void>;
  resolveConflict: (
    conflict: SyncConflict,
    resolution: 'keep_local' | 'keep_remote',
  ) => Promise<void>;
  // Security & Keys
  copySecret: (value: string, label?: string) => Promise<void>;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
  changeMasterPassword: (
    currentMasterPassword: string,
    newMasterPassword: string,
  ) => Promise<void>;
  regenerateRecoveryKey: () => Promise<string>;
  enrollPasskey: (label: string) => Promise<void>;
  removePasskey: (passkey: PasskeyCredentialRecord) => Promise<void>;
  revokeSession: (sessionId: string) => Promise<void>;
  createEncryptedBackup: (passphrase?: string) => Promise<EncryptedVaultBackupFile>;
  importEncryptedBackup: (
    backup: EncryptedVaultBackupFile,
    passphrase?: string,
  ) => Promise<number>;
  loadAiConversations: () => Promise<AiConversationThread[]>;
  saveAiConversation: (thread: AiConversationThread) => Promise<void>;
  deleteAiConversation: (id: string) => Promise<void>;
  refreshVaultState: () => Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const vekRef = useRef<Uint8Array | null>(null);
  const clipboardCancelRef = useRef<(() => void) | null>(null);
  const clipboardTimerRef = useRef<number | null>(null);
  const lockTimerRef = useRef<number | null>(null);

  const [backendMode] = useState<StorageBackendMode>(() => getStorageBackendMode());
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [vault, setVault] = useState<VaultMetadata | null>(null);
  const [envelopes, setEnvelopes] = useState<VaultKeyEnvelope[]>([]);
  const [encryptedItems, setEncryptedItems] = useState<EncryptedVaultItemRecord[]>([]);
  const [items, setItems] = useState<DecryptedVaultItem[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyCredentialRecord[]>([]);
  const [recoveryConfig, setRecoveryConfig] = useState<RecoveryConfigRecord | null>(null);
  const [deviceSessions, setDeviceSessions] = useState<DeviceSessionRecord[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEventRecord[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [hasQuickPin, setHasQuickPin] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pendingRecoveryKey, setPendingRecoveryKey] = useState<string | null>(null);
  const [clipboardCountdown, setClipboardCountdown] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const notify = useCallback(
    (message: string, tone: ToastNotification['tone'] = 'teal') => {
      const id = generateUuid();
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearInMemorySecrets = useCallback(() => {
    zeroizeBytes(vekRef.current);
    vekRef.current = null;
    setItems([]);
    setIsUnlocked(false);
    setPendingRecoveryKey(null);
  }, []);

  const loadForUser = useCallback(
    async (authUser: { id: string; email: string }) => {
      const state = await loadUserVaultState(authUser.id, authUser.email);
      setProfile(state.profile);
      setVault(state.vault);
      setEnvelopes(state.envelopes);
      setEncryptedItems(state.encryptedItems);
      setPasskeys(state.passkeys);
      setRecoveryConfig(state.recoveryConfig);
      setDeviceSessions(state.deviceSessions);
      setSecurityEvents(state.securityEvents);

      if (state.vault) {
        const pinReady = await hasQuickPinOnDevice(authUser.id, state.vault.id).catch(
          () => false,
        );
        setHasQuickPin(pinReady);
      } else {
        setHasQuickPin(false);
      }

      if (vekRef.current) {
        const { items: decrypted } = await decryptVaultItems(
          vekRef.current,
          state.encryptedItems,
        );
        setItems(decrypted);
        setIsUnlocked(true);
      }
    },
    [],
  );

  // Initial session hydration
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const current = await getCurrentAuthenticatedUser();
        if (!mounted) return;
        if (!current) {
          setAuthStatus('unauthenticated');
          return;
        }
        setUser(current);
        await loadForUser(current);
        if (mounted) setAuthStatus('authenticated');
      } catch {
        if (mounted) setAuthStatus('unauthenticated');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loadForUser]);

  // Wipe VEK from memory when tab/window closes
  useEffect(() => {
    const handleUnload = () => {
      zeroizeBytes(vekRef.current);
      vekRef.current = null;
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  const lockVault = useCallback(() => {
    const currentUser = user;
    const currentVault = vault;
    clearInMemorySecrets();
    if (currentUser) {
      void recordSecurityEvent({
        userId: currentUser.id,
        vaultId: currentVault?.id ?? null,
        eventType: 'vault_locked',
      });
    }
  }, [clearInMemorySecrets, user, vault]);

  // Auto-lock inactivity timer
  useEffect(() => {
    if (!isUnlocked) return;
    const autoLockMins = profile?.preferences.autoLockMinutes ?? DEFAULT_PREFERENCES.autoLockMinutes;
    if (autoLockMins <= 0) return;

    const timeoutMs = autoLockMins * 60 * 1000;

    const resetTimer = () => {
      if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
      lockTimerRef.current = window.setTimeout(() => {
        lockVault();
        notify('Vault auto-locked due to inactivity.', 'warning');
      }, timeoutMs);
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'keydown',
      'pointerdown',
      'touchstart',
    ];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [isUnlocked, profile?.preferences.autoLockMinutes, lockVault, notify]);

  // Realtime sync subscription when Supabase is active and vault is unlocked
  useEffect(() => {
    if (!isUnlocked || !vault) return;
    return subscribeToVaultRealtime(
      vault.id,
      async (remoteRecord) => {
        if (!vekRef.current) return;
        setEncryptedItems((prev) => {
          const exists = prev.some((r) => r.id === remoteRecord.id);
          return exists
            ? prev.map((r) => (r.id === remoteRecord.id ? remoteRecord : r))
            : [...prev, remoteRecord];
        });
        try {
          const decrypted = await decryptVaultItem(vekRef.current, remoteRecord);
          setItems((prev) => {
            const existing = prev.find((i) => i.id === decrypted.id);
            if (existing && existing.revision >= decrypted.revision) return prev;
            return existing
              ? prev.map((i) => (i.id === decrypted.id ? decrypted : i))
              : [decrypted, ...prev];
          });
        } catch {
          // Ignore items failing verification
        }
      },
      (deletedId) => {
        setEncryptedItems((prev) => prev.filter((r) => r.id !== deletedId));
        setItems((prev) => prev.filter((i) => i.id !== deletedId));
      },
    );
  }, [isUnlocked, vault]);

  const login = useCallback(
    async (email: string, password: string) => {
      const signedIn = await signInAccount(email, password);
      clearInMemorySecrets();
      setUser(signedIn);
      await loadForUser(signedIn);
      setAuthStatus('authenticated');
      await registerCurrentDeviceSession(signedIn.id);
    },
    [clearInMemorySecrets, loadForUser],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const created = await signUpAccount(email, password);
      if (created.requiresEmailConfirmation) {
        return { requiresEmailConfirmation: true };
      }
      clearInMemorySecrets();
      const authUser = { id: created.id, email: created.email };
      setUser(authUser);
      await loadForUser(authUser);
      setAuthStatus('authenticated');
      return { requiresEmailConfirmation: false };
    },
    [clearInMemorySecrets, loadForUser],
  );

  const logout = useCallback(async () => {
    clearInMemorySecrets();
    await clearAllLocalPinEnvelopes().catch(() => null);
    setHasQuickPin(false);
    await signOutAccount();
    setUser(null);
    setProfile(null);
    setVault(null);
    setEnvelopes([]);
    setEncryptedItems([]);
    setPasskeys([]);
    setRecoveryConfig(null);
    setDeviceSessions([]);
    setSecurityEvents([]);
    setAuthStatus('unauthenticated');
  }, [clearInMemorySecrets]);

  const setupNewVault = useCallback(
    async (masterPassword: string, vaultName = 'Personal Vault') => {
      if (!user) throw new Error('Not signed in.');
      const vaultId = generateUuid();
      const cryptoSetup = await initializeVaultKeys({
        userId: user.id,
        vaultId,
        masterPassword,
      });

      const persisted = await persistInitialVaultSetup({
        userId: user.id,
        vaultId,
        vaultName,
        masterEnvelope: cryptoSetup.masterEnvelope,
        recoveryEnvelope: cryptoSetup.recoveryEnvelope,
        recoveryFingerprint: cryptoSetup.recoveryFingerprint,
      });

      vekRef.current = cryptoSetup.vek;
      setVault(persisted.vault);
      setEnvelopes(persisted.envelopes);
      setRecoveryConfig(persisted.recoveryConfig);
      setEncryptedItems([]);
      setItems([]);
      setPendingRecoveryKey(cryptoSetup.recoveryKey);
      setIsUnlocked(true);
      await loadForUser(user);
      return cryptoSetup.recoveryKey;
    },
    [user, loadForUser],
  );

  const confirmRecoveryKeySaved = useCallback(() => {
    setPendingRecoveryKey(null);
  }, []);

  const unlockVaultWithVek = useCallback(
    async (vek: Uint8Array, method: 'master' | 'recovery' | 'passkey' | 'pin') => {
      if (!user || !vault) throw new Error('Vault metadata is unavailable.');
      vekRef.current = vek;
      const { items: decrypted } = await decryptVaultItems(vek, encryptedItems);
      setItems(decrypted);
      setIsUnlocked(true);
      await registerCurrentDeviceSession(user.id);
      const ev = await recordSecurityEvent({
        userId: user.id,
        vaultId: vault.id,
        eventType: method === 'recovery' ? 'recovery_unlock_used' : 'vault_unlocked',
        metadata: { method },
      });
      setSecurityEvents((prev) => [ev, ...prev]);
    },
    [user, vault, encryptedItems],
  );

  const unlockWithMaster = useCallback(
    async (masterPassword: string) => {
      if (!user || !vault) throw new Error('Vault not initialized.');
      const masterEnv = envelopes.find((e) => e.method === 'master');
      if (!masterEnv) throw new Error('Master password envelope not found.');

      try {
        const vek = await unlockWithMasterPassword({
          masterPassword,
          envelope: masterEnv,
        });
        await unlockVaultWithVek(vek, 'master');
      } catch (err) {
        const ev = await recordSecurityEvent({
          userId: user.id,
          vaultId: vault.id,
          eventType: 'unlock_failed',
          metadata: { method: 'master' },
        });
        setSecurityEvents((prev) => [ev, ...prev]);
        throw err;
      }
    },
    [user, vault, envelopes, unlockVaultWithVek],
  );

  const unlockWithRecovery = useCallback(
    async (recoveryKey: string) => {
      if (!user || !vault) throw new Error('Vault not initialized.');
      const recoveryEnv = envelopes.find((e) => e.method === 'recovery');
      if (!recoveryEnv) throw new Error('Recovery envelope not found.');

      try {
        const vek = await unlockWithRecoveryKey({
          recoveryKey,
          envelope: recoveryEnv,
        });
        await unlockVaultWithVek(vek, 'recovery');
      } catch (err) {
        const ev = await recordSecurityEvent({
          userId: user.id,
          vaultId: vault.id,
          eventType: 'unlock_failed',
          metadata: { method: 'recovery' },
        });
        setSecurityEvents((prev) => [ev, ...prev]);
        throw err;
      }
    },
    [user, vault, envelopes, unlockVaultWithVek],
  );

  const unlockWithPasskey = useCallback(async () => {
    if (!user || !vault) throw new Error('Vault not initialized.');
    try {
      const { vek } = await unlockWithPasskeyPrf(envelopes);
      await unlockVaultWithVek(vek, 'passkey');
    } catch (err) {
      const ev = await recordSecurityEvent({
        userId: user.id,
        vaultId: vault.id,
        eventType: 'unlock_failed',
        metadata: { method: 'passkey' },
      });
      setSecurityEvents((prev) => [ev, ...prev]);
      throw err;
    }
  }, [user, vault, envelopes, unlockVaultWithVek]);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      if (!user || !vault) throw new Error('Vault not initialized.');
      try {
        const vek = await unlockWithQuickPinOnDevice({
          userId: user.id,
          vaultId: vault.id,
          pin,
        });
        await unlockVaultWithVek(vek, 'pin');
      } catch (err) {
        if (err instanceof QuickPinWipedError) {
          setHasQuickPin(false);
          const ev = await recordSecurityEvent({
            userId: user.id,
            vaultId: vault.id,
            eventType: 'pin_locked_wiped',
            metadata: { reason: 'max_attempts_exceeded' },
          });
          setSecurityEvents((prev) => [ev, ...prev]);
        } else {
          const ev = await recordSecurityEvent({
            userId: user.id,
            vaultId: vault.id,
            eventType: 'unlock_failed',
            metadata: { method: 'pin' },
          });
          setSecurityEvents((prev) => [ev, ...prev]);
        }
        throw err;
      }
    },
    [user, vault, unlockVaultWithVek],
  );

  const setupQuickPin = useCallback(
    async (pin: string) => {
      if (!user || !vault || !vekRef.current) {
        throw new Error('Vault must be unlocked first.');
      }
      await enableQuickPinOnDevice({
        userId: user.id,
        vaultId: vault.id,
        vek: vekRef.current,
        pin,
      });
      setHasQuickPin(true);
      const ev = await recordSecurityEvent({
        userId: user.id,
        vaultId: vault.id,
        eventType: 'pin_enabled',
      });
      setSecurityEvents((prev) => [ev, ...prev]);
    },
    [user, vault],
  );

  const disableQuickPin = useCallback(async () => {
    if (!user || !vault) return;
    await disableQuickPinOnDevice(user.id, vault.id);
    setHasQuickPin(false);
    const ev = await recordSecurityEvent({
      userId: user.id,
      vaultId: vault.id,
      eventType: 'pin_disabled',
    });
    setSecurityEvents((prev) => [ev, ...prev]);
  }, [user, vault]);

  const createItem = useCallback(
    async (payload: VaultItemPayload) => {
      if (!vekRef.current || !user || !vault) {
        throw new Error('Vault must be unlocked first.');
      }
      const { encrypted, decrypted } = await createEncryptedVaultItem({
        vek: vekRef.current,
        userId: user.id,
        vaultId: vault.id,
        payload,
      });
      const saved = await saveEncryptedVaultItem(encrypted);
      setEncryptedItems((prev) => [saved, ...prev]);
      setItems((prev) => [decrypted, ...prev]);
      return decrypted;
    },
    [user, vault],
  );

  const bulkCreateItems = useCallback(
    async (payloads: VaultItemPayload[]) => {
      if (!vekRef.current || !user || !vault) {
        throw new Error('Vault must be unlocked first.');
      }
      const createdDecrypted: DecryptedVaultItem[] = [];
      const createdEncrypted: EncryptedVaultItemRecord[] = [];
      for (const payload of payloads) {
        const { encrypted, decrypted } = await createEncryptedVaultItem({
          vek: vekRef.current,
          userId: user.id,
          vaultId: vault.id,
          payload,
        });
        const saved = await saveEncryptedVaultItem(encrypted);
        createdEncrypted.push(saved);
        createdDecrypted.push(decrypted);
      }
      setEncryptedItems((prev) => [...createdEncrypted, ...prev]);
      setItems((prev) => [...createdDecrypted, ...prev]);
      return createdDecrypted;
    },
    [user, vault],
  );

  const updateItem = useCallback(
    async (existing: DecryptedVaultItem, nextPayload: VaultItemPayload) => {
      if (!vekRef.current || !user || !vault) {
        throw new Error('Vault must be unlocked first.');
      }
      const { encrypted, decrypted } = await updateEncryptedVaultItem({
        vek: vekRef.current,
        existing,
        nextPayload,
      });
      try {
        const saved = await saveEncryptedVaultItem(encrypted, existing.revision);
        setEncryptedItems((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
        setItems((prev) => prev.map((i) => (i.id === decrypted.id ? decrypted : i)));
        return decrypted;
      } catch (err) {
        if (err instanceof OptimisticConcurrencyError && vekRef.current) {
          let remoteDecrypted: DecryptedVaultItem | null = null;
          try {
            remoteDecrypted = await decryptVaultItem(vekRef.current, err.remoteRecord);
          } catch {
            remoteDecrypted = null;
          }
          setConflicts((prev) => [
            ...prev.filter((c) => c.itemId !== existing.id),
            {
              itemId: existing.id,
              localItem: decrypted,
              remoteEncrypted: err.remoteRecord,
              remoteDecrypted,
              detectedAt: new Date().toISOString(),
            },
          ]);
          await recordSecurityEvent({
            userId: user.id,
            vaultId: vault.id,
            eventType: 'item_conflict_detected',
            metadata: { itemId: existing.id },
          });
        }
        throw err;
      }
    },
    [user, vault],
  );

  const softDeleteItem = useCallback(
    async (item: DecryptedVaultItem) => {
      if (!vekRef.current) throw new Error('Vault must be unlocked.');
      const { encrypted, decrypted } = await updateEncryptedVaultItem({
        vek: vekRef.current,
        existing: item,
        nextPayload: item.payload,
        deletedAt: new Date().toISOString(),
      });
      const saved = await saveEncryptedVaultItem(encrypted, item.revision);
      setEncryptedItems((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      setItems((prev) => prev.map((i) => (i.id === decrypted.id ? decrypted : i)));
    },
    [],
  );

  const restoreItem = useCallback(async (item: DecryptedVaultItem) => {
    if (!vekRef.current) throw new Error('Vault must be unlocked.');
    const { encrypted, decrypted } = await updateEncryptedVaultItem({
      vek: vekRef.current,
      existing: item,
      nextPayload: item.payload,
      deletedAt: null,
    });
    const saved = await saveEncryptedVaultItem(encrypted, item.revision);
    setEncryptedItems((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
    setItems((prev) => prev.map((i) => (i.id === decrypted.id ? decrypted : i)));
  }, []);

  const purgeItem = useCallback(async (itemId: string) => {
    await purgeEncryptedVaultItem(itemId);
    setEncryptedItems((prev) => prev.filter((r) => r.id !== itemId));
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  const resolveConflict = useCallback(
    async (conflict: SyncConflict, resolution: 'keep_local' | 'keep_remote') => {
      if (!vekRef.current) throw new Error('Vault must be unlocked.');
      if (resolution === 'keep_remote') {
        setEncryptedItems((prev) =>
          prev.map((r) => (r.id === conflict.itemId ? conflict.remoteEncrypted : r)),
        );
        if (conflict.remoteDecrypted) {
          setItems((prev) =>
            prev.map((i) => (i.id === conflict.itemId ? conflict.remoteDecrypted! : i)),
          );
        }
      } else {
        const baseForLocal: DecryptedVaultItem = {
          ...conflict.localItem,
          revision: conflict.remoteEncrypted.revision,
        };
        const { encrypted, decrypted } = await updateEncryptedVaultItem({
          vek: vekRef.current,
          existing: baseForLocal,
          nextPayload: conflict.localItem.payload,
        });
        const saved = await saveEncryptedVaultItem(
          encrypted,
          conflict.remoteEncrypted.revision,
        );
        setEncryptedItems((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
        setItems((prev) => prev.map((i) => (i.id === decrypted.id ? decrypted : i)));
      }
      setConflicts((prev) => prev.filter((c) => c.itemId !== conflict.itemId));
      notify('Sync conflict resolved.', 'teal');
    },
    [notify],
  );

  const copySecret = useCallback(
    async (value: string, label = 'Secret') => {
      if (clipboardCancelRef.current) clipboardCancelRef.current();
      if (clipboardTimerRef.current) window.clearInterval(clipboardTimerRef.current);

      const seconds =
        profile?.preferences.clipboardClearSeconds ??
        DEFAULT_PREFERENCES.clipboardClearSeconds;

      const cancel = await copySecretWithAutoClear(
        value,
        seconds,
        (expiresAt) => {
          setClipboardCountdown(seconds);
          clipboardTimerRef.current = window.setInterval(() => {
            const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
            setClipboardCountdown(left > 0 ? left : null);
            if (left <= 0 && clipboardTimerRef.current) {
              window.clearInterval(clipboardTimerRef.current);
            }
          }, 500);
        },
        () => {
          setClipboardCountdown(null);
        },
      );

      clipboardCancelRef.current = cancel;
      notify(
        seconds > 0
          ? `${label} copied. Clipboard clears in ${seconds}s.`
          : `${label} copied to clipboard.`,
        'teal',
      );
    },
    [profile?.preferences.clipboardClearSeconds, notify],
  );

  const updatePreferences = useCallback(
    async (patch: Partial<UserPreferences>) => {
      if (!user || !profile) return;
      const nextPrefs = { ...profile.preferences, ...patch };
      await saveUserPreferences(user.id, nextPrefs);
      setProfile({ ...profile, preferences: nextPrefs });
      if ('cloudAiEnabled' in patch && vault) {
        const ev = await recordSecurityEvent({
          userId: user.id,
          vaultId: vault.id,
          eventType: 'cloud_ai_toggled',
          metadata: { enabled: Boolean(patch.cloudAiEnabled) },
        });
        setSecurityEvents((prev) => [ev, ...prev]);
      }
    },
    [user, profile, vault],
  );

  const changeMasterPassword = useCallback(
    async (currentMasterPassword: string, newMasterPassword: string) => {
      if (!user || !vault || !vekRef.current) {
        throw new Error('Vault must be unlocked.');
      }
      const existingMaster = envelopes.find((e) => e.method === 'master');
      if (!existingMaster) throw new Error('Master envelope missing.');

      // Verify current master password before rotating
      const verifiedVek = await unlockWithMasterPassword({
        masterPassword: currentMasterPassword,
        envelope: existingMaster,
      });
      zeroizeBytes(verifiedVek);

      const rotatedInput = await rotateMasterPassword({
        currentVek: vekRef.current,
        newMasterPassword,
        userId: user.id,
        vaultId: vault.id,
        nextKeyVersion: existingMaster.keyVersion + 1,
      });

      const savedEnv = await replaceMethodEnvelope({
        existingEnvelopeId: existingMaster.id,
        envelopeInput: rotatedInput,
      });

      setEnvelopes((prev) => prev.map((e) => (e.id === savedEnv.id ? savedEnv : e)));
      const ev = await recordSecurityEvent({
        userId: user.id,
        vaultId: vault.id,
        eventType: 'master_password_changed',
      });
      setSecurityEvents((prev) => [ev, ...prev]);
    },
    [user, vault, envelopes],
  );

  const regenerateRecoveryKey = useCallback(async () => {
    if (!user || !vault || !vekRef.current) {
      throw new Error('Vault must be unlocked.');
    }
    const existingRecovery = envelopes.find((e) => e.method === 'recovery');
    const rotated = await rotateRecoveryKey({
      currentVek: vekRef.current,
      userId: user.id,
      vaultId: vault.id,
      nextKeyVersion: (existingRecovery?.keyVersion ?? 0) + 1,
    });

    const savedEnv = await replaceMethodEnvelope({
      existingEnvelopeId: existingRecovery?.id,
      envelopeInput: rotated.recoveryEnvelope,
    });
    const recConfig = await updateRecoveryFingerprint(
      user.id,
      vault.id,
      rotated.recoveryFingerprint,
    );

    setEnvelopes((prev) => {
      const has = prev.some((e) => e.id === savedEnv.id);
      return has ? prev.map((e) => (e.id === savedEnv.id ? savedEnv : e)) : [...prev, savedEnv];
    });
    setRecoveryConfig(recConfig);
    const ev = await recordSecurityEvent({
      userId: user.id,
      vaultId: vault.id,
      eventType: 'recovery_key_rotated',
    });
    setSecurityEvents((prev) => [ev, ...prev]);
    return rotated.recoveryKey;
  }, [user, vault, envelopes]);

  const enrollPasskey = useCallback(
    async (label: string) => {
      if (!user || !vault || !vekRef.current) {
        throw new Error('Vault must be unlocked first.');
      }
      const reg = await registerPasskeyWithPrf({
        userId: user.id,
        email: user.email,
        vaultId: vault.id,
        label: label.trim() || 'Primary Passkey',
        vek: vekRef.current,
      });
      const persisted = await persistPasskeyEnrollment({
        userId: user.id,
        vaultId: vault.id,
        credentialId: reg.credentialId,
        label: label.trim() || 'Primary Passkey',
        transports: reg.transports,
        envelopeInput: reg.envelope,
      });
      setPasskeys((prev) => [...prev, persisted.passkey]);
      setEnvelopes((prev) => [...prev, persisted.envelope]);
      const ev = await recordSecurityEvent({
        userId: user.id,
        vaultId: vault.id,
        eventType: 'passkey_added',
        metadata: { label: persisted.passkey.label },
      });
      setSecurityEvents((prev) => [ev, ...prev]);
    },
    [user, vault],
  );

  const removePasskey = useCallback(
    async (passkey: PasskeyCredentialRecord) => {
      if (!user || !vault) return;
      await deletePasskeyEnrollment(passkey.id, passkey.credentialId);
      setPasskeys((prev) => prev.filter((p) => p.id !== passkey.id));
      setEnvelopes((prev) =>
        prev.filter(
          (e) => !(e.method === 'passkey' && e.credentialId === passkey.credentialId),
        ),
      );
      const ev = await recordSecurityEvent({
        userId: user.id,
        vaultId: vault.id,
        eventType: 'passkey_removed',
        metadata: { label: passkey.label },
      });
      setSecurityEvents((prev) => [ev, ...prev]);
    },
    [user, vault],
  );

  const revokeSession = useCallback(async (sessionId: string) => {
    await revokeDeviceSessionRecord(sessionId);
    setDeviceSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, revokedAt: new Date().toISOString() } : s,
      ),
    );
  }, []);

  const createEncryptedBackup = useCallback(
    async (passphrase?: string) => {
      if (!user || !vault || !vekRef.current) {
        throw new Error('Vault must be unlocked.');
      }
      const bundle = await exportEncryptedVaultBackup({
        vaultId: vault.id,
        items,
        vek: vekRef.current,
        backupPassphrase: passphrase,
      });
      const ev = await recordSecurityEvent({
        userId: user.id,
        vaultId: vault.id,
        eventType: 'backup_exported',
        metadata: { itemCount: bundle.itemCount, keyMode: bundle.keyMode },
      });
      setSecurityEvents((prev) => [ev, ...prev]);
      return bundle;
    },
    [user, vault, items],
  );

  const importEncryptedBackup = useCallback(
    async (backup: EncryptedVaultBackupFile, passphrase?: string) => {
      if (!user || !vault || !vekRef.current) {
        throw new Error('Vault must be unlocked.');
      }
      const restored = await restoreEncryptedVaultBackup({
        backup,
        vek: vekRef.current,
        backupPassphrase: passphrase,
      });
      const existingTitles = new Set(
        items
          .filter((i) => !i.deletedAt)
          .map((i) => `${i.payload.category}::${i.payload.title.toLowerCase()}`),
      );
      const toCreate = restored.items
        .filter(
          (entry) =>
            !existingTitles.has(
              `${entry.payload.category}::${entry.payload.title.toLowerCase()}`,
            ),
        )
        .map((entry) => entry.payload);

      await bulkCreateItems(toCreate);
      const ev = await recordSecurityEvent({
        userId: user.id,
        vaultId: vault.id,
        eventType: 'backup_restored',
        metadata: { importedCount: toCreate.length },
      });
      setSecurityEvents((prev) => [ev, ...prev]);
      return toCreate.length;
    },
    [user, vault, items, bulkCreateItems],
  );

  const loadAiConversations = useCallback(async (): Promise<AiConversationThread[]> => {
    if (!vekRef.current || !user || !vault) return [];
    const records = await getEncryptedAiConversations(vault.id);
    const metaKey = await deriveSubkeyHkdf(vekRef.current, 'meta');
    const threads: AiConversationThread[] = [];
    for (const rec of records) {
      try {
        const aad = utf8ToBytes(`keynest:ai:v1:${user.id}:${vault.id}:${rec.id}`);
        const pt = await decryptAesGcmWithKey(
          metaKey,
          base64ToBytes(rec.encryptedPayload),
          base64ToBytes(rec.nonce),
          aad,
        );
        threads.push(JSON.parse(bytesToUtf8(pt)) as AiConversationThread);
      } catch {
        // Ignore corrupted or rotated history entries
      }
    }
    return threads.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [user, vault]);

  const saveAiConversation = useCallback(
    async (thread: AiConversationThread) => {
      if (!vekRef.current || !user || !vault) return;
      const metaKey = await deriveSubkeyHkdf(vekRef.current, 'meta');
      const aad = utf8ToBytes(`keynest:ai:v1:${user.id}:${vault.id}:${thread.id}`);
      const { ciphertext, nonce } = await encryptAesGcmWithKey(
        metaKey,
        utf8ToBytes(JSON.stringify(thread)),
        aad,
      );
      await putEncryptedAiConversation({
        id: thread.id,
        vaultId: vault.id,
        encryptedPayload: bytesToBase64(ciphertext),
        nonce: bytesToBase64(nonce),
        updatedAt: thread.updatedAt,
      });
    },
    [user, vault],
  );

  const deleteAiConversation = useCallback(async (id: string) => {
    await deleteEncryptedAiConversation(id);
  }, []);

  const refreshVaultState = useCallback(async () => {
    if (!user) return;
    await loadForUser(user);
  }, [user, loadForUser]);

  const vaultStatus: VaultStatus = !vault
    ? 'needs_setup'
    : isUnlocked
      ? 'unlocked'
      : 'locked';

  const hasPasskeyEnvelope = useMemo(
    () => envelopes.some((e) => e.method === 'passkey'),
    [envelopes],
  );

  const value = useMemo<VaultContextValue>(
    () => ({
      backendMode,
      authStatus,
      vaultStatus,
      user,
      profile,
      vault,
      envelopes,
      items,
      encryptedCount: encryptedItems.length,
      passkeys,
      recoveryConfig,
      deviceSessions,
      securityEvents,
      conflicts,
      pendingRecoveryKey,
      webAuthnAvailable: isWebAuthnSupported(),
      hasPasskeyEnvelope,
      hasQuickPin,
      clipboardCountdown,
      toasts,
      notify,
      dismissToast,
      login,
      register,
      logout,
      setupNewVault,
      confirmRecoveryKeySaved,
      unlockWithMaster,
      unlockWithRecovery,
      unlockWithPasskey,
      unlockWithPin,
      setupQuickPin,
      disableQuickPin,
      lockVault,
      createItem,
      bulkCreateItems,
      updateItem,
      softDeleteItem,
      restoreItem,
      purgeItem,
      resolveConflict,
      copySecret,
      updatePreferences,
      changeMasterPassword,
      regenerateRecoveryKey,
      enrollPasskey,
      removePasskey,
      revokeSession,
      createEncryptedBackup,
      importEncryptedBackup,
      loadAiConversations,
      saveAiConversation,
      deleteAiConversation,
      refreshVaultState,
    }),
    [
      backendMode,
      authStatus,
      vaultStatus,
      user,
      profile,
      vault,
      envelopes,
      items,
      encryptedItems.length,
      passkeys,
      recoveryConfig,
      deviceSessions,
      securityEvents,
      conflicts,
      pendingRecoveryKey,
      hasPasskeyEnvelope,
      hasQuickPin,
      clipboardCountdown,
      toasts,
      notify,
      dismissToast,
      login,
      register,
      logout,
      setupNewVault,
      confirmRecoveryKeySaved,
      unlockWithMaster,
      unlockWithRecovery,
      unlockWithPasskey,
      unlockWithPin,
      setupQuickPin,
      disableQuickPin,
      lockVault,
      createItem,
      bulkCreateItems,
      updateItem,
      softDeleteItem,
      restoreItem,
      purgeItem,
      resolveConflict,
      copySecret,
      updatePreferences,
      changeMasterPassword,
      regenerateRecoveryKey,
      enrollPasskey,
      removePasskey,
      revokeSession,
      createEncryptedBackup,
      importEncryptedBackup,
      loadAiConversations,
      saveAiConversation,
      deleteAiConversation,
      refreshVaultState,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return ctx;
}

