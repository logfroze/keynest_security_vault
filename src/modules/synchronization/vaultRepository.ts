import {
  base64ToBytes,
  bytesToBase64,
  bytesToPgHex,
  pgByteaToBytes,
} from '../cryptography/encoding';
import {
  generateRandomBytes,
  sha256Hex,
} from '../cryptography/cryptoEngine';
import { getCurrentDeviceLabel } from '../security/securityUtils';
import { generateUuid } from '../vault/vaultManager';
import {
  cacheEncryptedItemsToIdb,
  DEFAULT_PREFERENCES,
  getActiveLocalSessionEmail,
  getEncryptedDb,
  setActiveLocalSessionEmail,
} from '@/lib/storage/indexedDbStore';
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from '@/lib/supabase/client';
import type { NewEnvelopeInput } from '../key-management/keyManager';
import type {
  DeviceSessionRecord,
  EncryptedVaultItemRecord,
  PasskeyCredentialRecord,
  RecoveryConfigRecord,
  SecurityEventRecord,
  SecurityEventType,
  StorageBackendMode,
  UserPreferences,
  UserProfile,
  VaultKeyEnvelope,
  VaultMetadata,
} from '@/types/vault';

export class OptimisticConcurrencyError extends Error {
  public readonly remoteRecord: EncryptedVaultItemRecord;

  constructor(message: string, remoteRecord: EncryptedVaultItemRecord) {
    super(message);
    this.name = 'OptimisticConcurrencyError';
    this.remoteRecord = remoteRecord;
  }
}

export interface LoadedVaultState {
  profile: UserProfile;
  vault: VaultMetadata | null;
  envelopes: VaultKeyEnvelope[];
  encryptedItems: EncryptedVaultItemRecord[];
  passkeys: PasskeyCredentialRecord[];
  recoveryConfig: RecoveryConfigRecord | null;
  deviceSessions: DeviceSessionRecord[];
  securityEvents: SecurityEventRecord[];
}

export function getStorageBackendMode(): StorageBackendMode {
  return isSupabaseConfigured() ? 'supabase' : 'local';
}

async function hashLocalAccountPassword(password: string, saltB64: string): Promise<string> {
  return sha256Hex(`keynest-local-auth-v1:${saltB64}:${password}`);
}

function mapSupabaseItemRow(row: Record<string, unknown>): EncryptedVaultItemRecord {
  const rawPayload = String(row.encrypted_payload);
  const rawNonce = String(row.nonce);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    vaultId: String(row.vault_id),
    encryptedPayload: bytesToBase64(pgByteaToBytes(rawPayload)),
    nonce: bytesToBase64(pgByteaToBytes(rawNonce)),
    encryptionVersion: Number(row.encryption_version ?? 1),
    revision: Number(row.revision ?? 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  };
}

function mapSupabaseEnvelopeRow(row: Record<string, unknown>): VaultKeyEnvelope {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    vaultId: String(row.vault_id),
    method: row.method as VaultKeyEnvelope['method'],
    credentialId: row.credential_id ? String(row.credential_id) : null,
    salt: String(row.salt),
    kdfParams: row.kdf_params as VaultKeyEnvelope['kdfParams'],
    wrappedVek: String(row.wrapped_vek),
    nonce: String(row.nonce),
    keyVersion: Number(row.key_version ?? 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getCurrentAuthenticatedUser(): Promise<{
  id: string;
  email: string;
} | null> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      if (code) {
        await supabase.auth.exchangeCodeForSession(code).catch(() => null);
        url.searchParams.delete('code');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    }
    try {
      const { data, error } = await supabase.auth.getUser();
      if (data.user) {
        return {
          id: data.user.id,
          email: data.user.email ?? '',
        };
      }
      if (
        error &&
        ((typeof navigator !== 'undefined' && !navigator.onLine) ||
          error.name === 'AuthRetryableFetchError')
      ) {
        const { data: sessionData } = await supabase.auth.getSession();
        const cachedUser = sessionData.session?.user;
        if (cachedUser) {
          return {
            id: cachedUser.id,
            email: cachedUser.email ?? '',
          };
        }
      }
      return null;
    } catch {
      const { data: sessionData } = await supabase.auth.getSession();
      const cachedUser = sessionData.session?.user;
      if (!cachedUser) return null;
      return {
        id: cachedUser.id,
        email: cachedUser.email ?? '',
      };
    }
  }

  const email = await getActiveLocalSessionEmail();
  if (!email) return null;
  const db = await getEncryptedDb();
  const account = await db.get('localAccounts', email.toLowerCase());
  if (!account) return null;
  return { id: account.id, email: account.email };
}

export async function signUpAccount(
  email: string,
  accountPassword: string,
): Promise<{ id: string; email: string; requiresEmailConfirmation?: boolean }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }
  if (accountPassword.length < 6) {
    throw new Error('Account password must be at least 6 characters.');
  }

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: accountPassword,
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Registration did not return a user.');

    const requiresEmailConfirmation = !data.session;
    if (data.session) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: normalizedEmail,
        preferences: DEFAULT_PREFERENCES,
      });
    }
    return {
      id: data.user.id,
      email: normalizedEmail,
      requiresEmailConfirmation,
    };
  }

  // Local encrypted IndexedDB account registration
  const db = await getEncryptedDb();
  const existing = await db.get('localAccounts', normalizedEmail);
  if (existing) {
    throw new Error('An account with this email already exists on this device. Please sign in.');
  }

  const id = generateUuid();
  const now = new Date().toISOString();
  const saltB64 = bytesToBase64(generateRandomBytes(16));
  const verifier = await hashLocalAccountPassword(accountPassword, saltB64);

  await db.put('localAccounts', {
    id,
    email: normalizedEmail,
    passwordSalt: saltB64,
    passwordVerifier: verifier,
    createdAt: now,
  });

  await db.put('profiles', {
    id,
    email: normalizedEmail,
    displayName: null,
    preferences: { ...DEFAULT_PREFERENCES },
    createdAt: now,
    updatedAt: now,
  });

  await setActiveLocalSessionEmail(normalizedEmail);
  await recordSecurityEvent({
    userId: id,
    vaultId: null,
    eventType: 'account_created',
    metadata: { mode: 'local' },
  });

  return { id, email: normalizedEmail };
}

export async function signInAccount(
  email: string,
  accountPassword: string,
): Promise<{ id: string; email: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: accountPassword,
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Sign in failed.');
    return { id: data.user.id, email: data.user.email ?? normalizedEmail };
  }

  const db = await getEncryptedDb();
  const account = await db.get('localAccounts', normalizedEmail);
  if (!account) {
    throw new Error('No local account found for this email. Create an account first.');
  }
  const expected = await hashLocalAccountPassword(accountPassword, account.passwordSalt);
  if (expected !== account.passwordVerifier) {
    throw new Error('Invalid account email or password.');
  }
  await setActiveLocalSessionEmail(normalizedEmail);
  return { id: account.id, email: account.email };
}

export async function signOutAccount(): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.auth.signOut();
    return;
  }
  await setActiveLocalSessionEmail(null);
}

export async function loadUserVaultState(
  userId: string,
  email: string,
): Promise<LoadedVaultState> {
  const supabase = getSupabaseBrowserClient();
  const now = new Date().toISOString();

  if (supabase) {
    let { data: profileRow } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!profileRow) {
      const { data: inserted } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email,
          preferences: DEFAULT_PREFERENCES,
        })
        .select('*')
        .single();
      profileRow = inserted;
    }

    const profile: UserProfile = {
      id: userId,
      email: String(profileRow?.email ?? email),
      displayName: profileRow?.display_name ? String(profileRow.display_name) : null,
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...(profileRow?.preferences as Partial<UserPreferences> | undefined),
      },
      createdAt: String(profileRow?.created_at ?? now),
      updatedAt: String(profileRow?.updated_at ?? now),
    };

    const { data: vaultRow } = await supabase
      .from('vaults')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!vaultRow) {
      return {
        profile,
        vault: null,
        envelopes: [],
        encryptedItems: [],
        passkeys: [],
        recoveryConfig: null,
        deviceSessions: [],
        securityEvents: [],
      };
    }

    const vault: VaultMetadata = {
      id: String(vaultRow.id),
      userId: String(vaultRow.user_id),
      name: String(vaultRow.name),
      encryptionVersion: Number(vaultRow.encryption_version ?? 1),
      kdfAlgorithm: String(vaultRow.kdf_algorithm ?? 'argon2id'),
      createdAt: String(vaultRow.created_at),
      updatedAt: String(vaultRow.updated_at),
    };

    const [envRes, itemsRes, passkeysRes, recRes, sessionsRes, eventsRes] = await Promise.all([
      supabase.from('vault_key_envelopes').select('*').eq('vault_id', vault.id),
      supabase.from('vault_items').select('*').eq('vault_id', vault.id),
      supabase.from('passkey_credentials').select('*').eq('vault_id', vault.id),
      supabase.from('recovery_config').select('*').eq('vault_id', vault.id).maybeSingle(),
      supabase
        .from('device_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('last_seen_at', { ascending: false }),
      supabase
        .from('security_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(40),
    ]);

    const encryptedItems = (itemsRes.data ?? []).map((row) =>
      mapSupabaseItemRow(row as Record<string, unknown>),
    );
    await cacheEncryptedItemsToIdb(encryptedItems);

    return {
      profile,
      vault,
      envelopes: (envRes.data ?? []).map((r) =>
        mapSupabaseEnvelopeRow(r as Record<string, unknown>),
      ),
      encryptedItems,
      passkeys: (passkeysRes.data ?? []).map((r) => ({
        id: String(r.id),
        userId: String(r.user_id),
        vaultId: String(r.vault_id),
        credentialId: String(r.credential_id),
        label: String(r.label),
        prfEnabled: Boolean(r.prf_enabled),
        transports: Array.isArray(r.transports) ? (r.transports as string[]) : [],
        createdAt: String(r.created_at),
        lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
      })),
      recoveryConfig: recRes.data
        ? {
            id: String(recRes.data.id),
            userId: String(recRes.data.user_id),
            vaultId: String(recRes.data.vault_id),
            keyFingerprint: String(recRes.data.key_fingerprint),
            verifiedAt: recRes.data.verified_at ? String(recRes.data.verified_at) : null,
            rotatedAt: String(recRes.data.rotated_at),
          }
        : null,
      deviceSessions: (sessionsRes.data ?? []).map((s) => ({
        id: String(s.id),
        userId: String(s.user_id),
        deviceLabel: String(s.device_label),
        userAgent: s.user_agent ? String(s.user_agent) : null,
        lastSeenAt: String(s.last_seen_at),
        revokedAt: s.revoked_at ? String(s.revoked_at) : null,
        createdAt: String(s.created_at),
      })),
      securityEvents: (eventsRes.data ?? []).map((ev) => ({
        id: String(ev.id),
        userId: String(ev.user_id),
        vaultId: ev.vault_id ? String(ev.vault_id) : null,
        eventType: ev.event_type as SecurityEventType,
        deviceLabel: ev.device_label ? String(ev.device_label) : null,
        metadata: (ev.metadata ?? {}) as SecurityEventRecord['metadata'],
        createdAt: String(ev.created_at),
      })),
    };
  }

  // Local encrypted IndexedDB mode
  const db = await getEncryptedDb();
  let profile = await db.get('profiles', userId);
  if (!profile) {
    profile = {
      id: userId,
      email,
      displayName: null,
      preferences: { ...DEFAULT_PREFERENCES },
      createdAt: now,
      updatedAt: now,
    };
    await db.put('profiles', profile);
  }

  const userVaults = await db.getAllFromIndex('vaults', 'by-user', userId);
  const vault = userVaults[0] ?? null;

  if (!vault) {
    return {
      profile,
      vault: null,
      envelopes: [],
      encryptedItems: [],
      passkeys: [],
      recoveryConfig: null,
      deviceSessions: [],
      securityEvents: [],
    };
  }

  const [envelopes, encryptedItems, passkeys, recoveryConfig, deviceSessions, securityEvents] =
    await Promise.all([
      db.getAllFromIndex('envelopes', 'by-vault', vault.id),
      db.getAllFromIndex('encryptedItems', 'by-vault', vault.id),
      db.getAllFromIndex('passkeys', 'by-vault', vault.id),
      db.get('recoveryConfigs', vault.id),
      db.getAllFromIndex('deviceSessions', 'by-user', userId),
      db.getAllFromIndex('securityEvents', 'by-user', userId),
    ]);

  return {
    profile,
    vault,
    envelopes,
    encryptedItems,
    passkeys,
    recoveryConfig: recoveryConfig ?? null,
    deviceSessions: [...deviceSessions].sort(
      (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
    ),
    securityEvents: [...securityEvents]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 40),
  };
}

export async function persistInitialVaultSetup(params: {
  userId: string;
  vaultId: string;
  vaultName: string;
  masterEnvelope: NewEnvelopeInput;
  recoveryEnvelope: NewEnvelopeInput;
  recoveryFingerprint: string;
}): Promise<{
  vault: VaultMetadata;
  envelopes: VaultKeyEnvelope[];
  recoveryConfig: RecoveryConfigRecord;
}> {
  const now = new Date().toISOString();
  const vault: VaultMetadata = {
    id: params.vaultId,
    userId: params.userId,
    name: params.vaultName,
    encryptionVersion: 1,
    kdfAlgorithm: 'argon2id',
    createdAt: now,
    updatedAt: now,
  };

  const masterEnv: VaultKeyEnvelope = {
    ...params.masterEnvelope,
    id: generateUuid(),
    createdAt: now,
    updatedAt: now,
  };
  const recoveryEnv: VaultKeyEnvelope = {
    ...params.recoveryEnvelope,
    id: generateUuid(),
    createdAt: now,
    updatedAt: now,
  };
  const recoveryConfig: RecoveryConfigRecord = {
    id: generateUuid(),
    userId: params.userId,
    vaultId: params.vaultId,
    keyFingerprint: params.recoveryFingerprint,
    verifiedAt: now,
    rotatedAt: now,
  };

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error: vErr } = await supabase.from('vaults').insert({
      id: vault.id,
      user_id: vault.userId,
      name: vault.name,
      encryption_version: vault.encryptionVersion,
      kdf_algorithm: vault.kdfAlgorithm,
    });
    if (vErr) throw new Error(vErr.message);

    const { error: envErr } = await supabase.from('vault_key_envelopes').insert([
      {
        id: masterEnv.id,
        user_id: masterEnv.userId,
        vault_id: masterEnv.vaultId,
        method: masterEnv.method,
        credential_id: masterEnv.credentialId,
        salt: masterEnv.salt,
        kdf_params: masterEnv.kdfParams,
        wrapped_vek: masterEnv.wrappedVek,
        nonce: masterEnv.nonce,
        key_version: masterEnv.keyVersion,
      },
      {
        id: recoveryEnv.id,
        user_id: recoveryEnv.userId,
        vault_id: recoveryEnv.vaultId,
        method: recoveryEnv.method,
        credential_id: recoveryEnv.credentialId,
        salt: recoveryEnv.salt,
        kdf_params: recoveryEnv.kdfParams,
        wrapped_vek: recoveryEnv.wrappedVek,
        nonce: recoveryEnv.nonce,
        key_version: recoveryEnv.keyVersion,
      },
    ]);
    if (envErr) throw new Error(envErr.message);

    const { error: recErr } = await supabase.from('recovery_config').insert({
      id: recoveryConfig.id,
      user_id: recoveryConfig.userId,
      vault_id: recoveryConfig.vaultId,
      key_fingerprint: recoveryConfig.keyFingerprint,
      verified_at: recoveryConfig.verifiedAt,
      rotated_at: recoveryConfig.rotatedAt,
    });
    if (recErr) throw new Error(recErr.message);
  } else {
    const db = await getEncryptedDb();
    await db.put('vaults', vault);
    await db.put('envelopes', masterEnv);
    await db.put('envelopes', recoveryEnv);
    await db.put('recoveryConfigs', recoveryConfig);
  }

  await registerCurrentDeviceSession(params.userId);
  await recordSecurityEvent({
    userId: params.userId,
    vaultId: params.vaultId,
    eventType: 'vault_initialized',
  });

  return { vault, envelopes: [masterEnv, recoveryEnv], recoveryConfig };
}

export async function saveEncryptedVaultItem(
  record: EncryptedVaultItemRecord,
  expectedRevision?: number,
): Promise<EncryptedVaultItemRecord> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    if (expectedRevision === undefined) {
      const { data, error } = await supabase
        .from('vault_items')
        .insert({
          id: record.id,
          user_id: record.userId,
          vault_id: record.vaultId,
          encrypted_payload: bytesToPgHex(base64ToBytes(record.encryptedPayload)),
          nonce: bytesToPgHex(base64ToBytes(record.nonce)),
          encryption_version: record.encryptionVersion,
          revision: record.revision,
          created_at: record.createdAt,
          updated_at: record.updatedAt,
          deleted_at: record.deletedAt,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      const saved = mapSupabaseItemRow(data as Record<string, unknown>);
      await cacheEncryptedItemsToIdb([saved]);
      return saved;
    }

    const { data, error } = await supabase
      .from('vault_items')
      .update({
        encrypted_payload: bytesToPgHex(base64ToBytes(record.encryptedPayload)),
        nonce: bytesToPgHex(base64ToBytes(record.nonce)),
        encryption_version: record.encryptionVersion,
        revision: record.revision,
        deleted_at: record.deletedAt,
      })
      .eq('id', record.id)
      .eq('revision', expectedRevision)
      .select('*')
      .maybeSingle();

    if (error) {
      // Check if conflict
      const { data: latest } = await supabase
        .from('vault_items')
        .select('*')
        .eq('id', record.id)
        .maybeSingle();
      if (latest) {
        throw new OptimisticConcurrencyError(
          'This record was modified on another device.',
          mapSupabaseItemRow(latest as Record<string, unknown>),
        );
      }
      throw new Error(error.message);
    }

    if (!data) {
      const { data: latest } = await supabase
        .from('vault_items')
        .select('*')
        .eq('id', record.id)
        .maybeSingle();
      if (latest) {
        throw new OptimisticConcurrencyError(
          'This record was updated on another device (revision mismatch).',
          mapSupabaseItemRow(latest as Record<string, unknown>),
        );
      }
      throw new Error('Item not found on server.');
    }

    const saved = mapSupabaseItemRow(data as Record<string, unknown>);
    await cacheEncryptedItemsToIdb([saved]);
    return saved;
  }

  // Local IndexedDB with optimistic concurrency guard
  const db = await getEncryptedDb();
  if (expectedRevision !== undefined) {
    const existing = await db.get('encryptedItems', record.id);
    if (existing && existing.revision !== expectedRevision) {
      throw new OptimisticConcurrencyError(
        'This record was modified elsewhere (revision mismatch).',
        existing,
      );
    }
  }
  await db.put('encryptedItems', record);
  return record;
}

export async function purgeEncryptedVaultItem(itemId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error } = await supabase.from('vault_items').delete().eq('id', itemId);
    if (error) throw new Error(error.message);
  }
  const db = await getEncryptedDb();
  await db.delete('encryptedItems', itemId);
}

export async function replaceMethodEnvelope(params: {
  existingEnvelopeId?: string;
  envelopeInput: NewEnvelopeInput;
}): Promise<VaultKeyEnvelope> {
  const now = new Date().toISOString();
  const nextEnv: VaultKeyEnvelope = {
    ...params.envelopeInput,
    id: params.existingEnvelopeId ?? generateUuid(),
    createdAt: now,
    updatedAt: now,
  };

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    if (params.existingEnvelopeId) {
      const { error } = await supabase
        .from('vault_key_envelopes')
        .update({
          salt: nextEnv.salt,
          kdf_params: nextEnv.kdfParams,
          wrapped_vek: nextEnv.wrappedVek,
          nonce: nextEnv.nonce,
          key_version: nextEnv.keyVersion,
        })
        .eq('id', params.existingEnvelopeId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from('vault_key_envelopes').insert({
        id: nextEnv.id,
        user_id: nextEnv.userId,
        vault_id: nextEnv.vaultId,
        method: nextEnv.method,
        credential_id: nextEnv.credentialId,
        salt: nextEnv.salt,
        kdf_params: nextEnv.kdfParams,
        wrapped_vek: nextEnv.wrappedVek,
        nonce: nextEnv.nonce,
        key_version: nextEnv.keyVersion,
      });
      if (error) throw new Error(error.message);
    }
    return nextEnv;
  }

  const db = await getEncryptedDb();
  await db.put('envelopes', nextEnv);
  return nextEnv;
}

export async function updateRecoveryFingerprint(
  userId: string,
  vaultId: string,
  keyFingerprint: string,
): Promise<RecoveryConfigRecord> {
  const now = new Date().toISOString();
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('recovery_config')
      .upsert(
        {
          user_id: userId,
          vault_id: vaultId,
          key_fingerprint: keyFingerprint,
          rotated_at: now,
          verified_at: now,
        },
        { onConflict: 'vault_id' },
      )
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return {
      id: String(data.id),
      userId: String(data.user_id),
      vaultId: String(data.vault_id),
      keyFingerprint: String(data.key_fingerprint),
      verifiedAt: data.verified_at ? String(data.verified_at) : null,
      rotatedAt: String(data.rotated_at),
    };
  }

  const db = await getEncryptedDb();
  const existing = await db.get('recoveryConfigs', vaultId);
  const record: RecoveryConfigRecord = {
    id: existing?.id ?? generateUuid(),
    userId,
    vaultId,
    keyFingerprint,
    verifiedAt: now,
    rotatedAt: now,
  };
  await db.put('recoveryConfigs', record);
  return record;
}

export async function persistPasskeyEnrollment(params: {
  userId: string;
  vaultId: string;
  credentialId: string;
  label: string;
  transports: string[];
  envelopeInput: Omit<VaultKeyEnvelope, 'id' | 'createdAt' | 'updatedAt'>;
}): Promise<{ passkey: PasskeyCredentialRecord; envelope: VaultKeyEnvelope }> {
  const now = new Date().toISOString();
  const passkey: PasskeyCredentialRecord = {
    id: generateUuid(),
    userId: params.userId,
    vaultId: params.vaultId,
    credentialId: params.credentialId,
    label: params.label,
    prfEnabled: true,
    transports: params.transports,
    createdAt: now,
    lastUsedAt: now,
  };
  const envelope: VaultKeyEnvelope = {
    ...params.envelopeInput,
    id: generateUuid(),
    createdAt: now,
    updatedAt: now,
  };

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error: pkErr } = await supabase.from('passkey_credentials').insert({
      id: passkey.id,
      user_id: passkey.userId,
      vault_id: passkey.vaultId,
      credential_id: passkey.credentialId,
      label: passkey.label,
      prf_enabled: passkey.prfEnabled,
      transports: passkey.transports,
      last_used_at: passkey.lastUsedAt,
    });
    if (pkErr) throw new Error(pkErr.message);

    const { error: envErr } = await supabase.from('vault_key_envelopes').insert({
      id: envelope.id,
      user_id: envelope.userId,
      vault_id: envelope.vaultId,
      method: 'passkey',
      credential_id: envelope.credentialId,
      salt: envelope.salt,
      kdf_params: envelope.kdfParams,
      wrapped_vek: envelope.wrappedVek,
      nonce: envelope.nonce,
      key_version: envelope.keyVersion,
    });
    if (envErr) throw new Error(envErr.message);
  } else {
    const db = await getEncryptedDb();
    await db.put('passkeys', passkey);
    await db.put('envelopes', envelope);
  }

  return { passkey, envelope };
}

export async function deletePasskeyEnrollment(
  passkeyId: string,
  credentialId: string,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.from('passkey_credentials').delete().eq('id', passkeyId);
    await supabase
      .from('vault_key_envelopes')
      .delete()
      .eq('method', 'passkey')
      .eq('credential_id', credentialId);
    return;
  }

  const db = await getEncryptedDb();
  await db.delete('passkeys', passkeyId);
  const allEnv = await db.getAll('envelopes');
  for (const env of allEnv) {
    if (env.method === 'passkey' && env.credentialId === credentialId) {
      await db.delete('envelopes', env.id);
    }
  }
}

export async function saveUserPreferences(
  userId: string,
  preferences: UserPreferences,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error } = await supabase
      .from('profiles')
      .update({ preferences })
      .eq('id', userId);
    if (error) throw new Error(error.message);
    return;
  }

  const db = await getEncryptedDb();
  const profile = await db.get('profiles', userId);
  if (profile) {
    await db.put('profiles', {
      ...profile,
      preferences,
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function registerCurrentDeviceSession(userId: string): Promise<DeviceSessionRecord> {
  const now = new Date().toISOString();
  const deviceLabel = getCurrentDeviceLabel();
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 220) : null;
  const session: DeviceSessionRecord = {
    id: generateUuid(),
    userId,
    deviceLabel,
    userAgent,
    lastSeenAt: now,
    revokedAt: null,
    createdAt: now,
  };

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data: existingList } = await supabase
      .from('device_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('device_label', deviceLabel)
      .is('revoked_at', null)
      .limit(1);

    const existingRow = existingList?.[0];
    if (existingRow) {
      await supabase
        .from('device_sessions')
        .update({ last_seen_at: now })
        .eq('id', existingRow.id);
      return {
        id: String(existingRow.id),
        userId: String(existingRow.user_id),
        deviceLabel: String(existingRow.device_label),
        userAgent: existingRow.user_agent ? String(existingRow.user_agent) : null,
        lastSeenAt: now,
        revokedAt: null,
        createdAt: String(existingRow.created_at),
      };
    }

    await supabase.from('device_sessions').insert({
      id: session.id,
      user_id: session.userId,
      device_label: session.deviceLabel,
      user_agent: session.userAgent,
      last_seen_at: session.lastSeenAt,
    });
    return session;
  }

  const db = await getEncryptedDb();
  const existing = await db.getAllFromIndex('deviceSessions', 'by-user', userId);
  const sameDevice = existing.find((s) => s.deviceLabel === deviceLabel && !s.revokedAt);
  if (sameDevice) {
    const updated = { ...sameDevice, lastSeenAt: now };
    await db.put('deviceSessions', updated);
    return updated;
  }
  await db.put('deviceSessions', session);
  return session;
}

export async function revokeDeviceSessionRecord(sessionId: string): Promise<void> {
  const now = new Date().toISOString();
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.from('device_sessions').update({ revoked_at: now }).eq('id', sessionId);
    return;
  }
  const db = await getEncryptedDb();
  const existing = await db.get('deviceSessions', sessionId);
  if (existing) {
    await db.put('deviceSessions', { ...existing, revokedAt: now });
  }
}

export async function recordSecurityEvent(params: {
  userId: string;
  vaultId: string | null;
  eventType: SecurityEventType;
  metadata?: Record<string, string | number | boolean>;
}): Promise<SecurityEventRecord> {
  const event: SecurityEventRecord = {
    id: generateUuid(),
    userId: params.userId,
    vaultId: params.vaultId,
    eventType: params.eventType,
    deviceLabel: getCurrentDeviceLabel(),
    metadata: params.metadata ?? {},
    createdAt: new Date().toISOString(),
  };

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.from('security_events').insert({
      id: event.id,
      user_id: event.userId,
      vault_id: event.vaultId,
      event_type: event.eventType,
      device_label: event.deviceLabel,
      metadata: event.metadata,
    });
    return event;
  }

  const db = await getEncryptedDb();
  await db.put('securityEvents', event);
  return event;
}

export function subscribeToVaultRealtime(
  vaultId: string,
  onItemUpserted: (record: EncryptedVaultItemRecord) => void,
  onItemDeleted: (itemId: string) => void,
): () => void {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`keynest-vault-${vaultId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'vault_items',
        filter: `vault_id=eq.${vaultId}`,
      },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as { id?: string })?.id;
          if (oldId) onItemDeleted(oldId);
          return;
        }
        if (payload.new) {
          onItemUpserted(mapSupabaseItemRow(payload.new as Record<string, unknown>));
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

