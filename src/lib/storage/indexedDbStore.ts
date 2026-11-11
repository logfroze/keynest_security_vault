import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  DeviceSessionRecord,
  EncryptedAiConversationRecord,
  EncryptedVaultItemRecord,
  PasskeyCredentialRecord,
  RecoveryConfigRecord,
  SecurityEventRecord,
  UserPreferences,
  UserProfile,
  VaultKeyEnvelope,
  VaultMetadata,
} from '@/types/vault';

export interface LocalAccountRecord {
  id: string;
  email: string;
  passwordSalt: string;
  passwordVerifier: string;
  createdAt: string;
}

export interface PendingSyncMutation {
  id: string;
  itemId: string;
  action: 'upsert' | 'delete';
  record?: EncryptedVaultItemRecord;
  queuedAt: string;
}

interface KeyNestIdbSchema extends DBSchema {
  localAccounts: {
    key: string; // email
    value: LocalAccountRecord;
  };
  profiles: {
    key: string; // userId
    value: UserProfile;
  };
  vaults: {
    key: string; // vaultId
    value: VaultMetadata;
    indexes: { 'by-user': string };
  };
  envelopes: {
    key: string; // envelopeId
    value: VaultKeyEnvelope;
    indexes: { 'by-vault': string; 'by-user': string };
  };
  encryptedItems: {
    key: string; // itemId
    value: EncryptedVaultItemRecord;
    indexes: { 'by-vault': string; 'by-user': string };
  };
  passkeys: {
    key: string; // id
    value: PasskeyCredentialRecord;
    indexes: { 'by-vault': string };
  };
  recoveryConfigs: {
    key: string; // vaultId
    value: RecoveryConfigRecord;
  };
  deviceSessions: {
    key: string; // id
    value: DeviceSessionRecord;
    indexes: { 'by-user': string };
  };
  securityEvents: {
    key: string; // id
    value: SecurityEventRecord;
    indexes: { 'by-user': string };
  };
  syncQueue: {
    key: string; // id
    value: PendingSyncMutation;
  };
  appState: {
    key: string;
    value: { key: string; value: string };
  };
  aiConversations: {
    key: string; // id
    value: EncryptedAiConversationRecord;
    indexes: { 'by-vault': string };
  };
}

const DB_NAME = 'keynest_encrypted_vault_db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<KeyNestIdbSchema>> | null = null;

export function getEncryptedDb(): Promise<IDBPDatabase<KeyNestIdbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<KeyNestIdbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('localAccounts')) {
          db.createObjectStore('localAccounts', { keyPath: 'email' });
        }
        if (!db.objectStoreNames.contains('profiles')) {
          db.createObjectStore('profiles', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('vaults')) {
          const store = db.createObjectStore('vaults', { keyPath: 'id' });
          store.createIndex('by-user', 'userId');
        }
        if (!db.objectStoreNames.contains('envelopes')) {
          const store = db.createObjectStore('envelopes', { keyPath: 'id' });
          store.createIndex('by-vault', 'vaultId');
          store.createIndex('by-user', 'userId');
        }
        if (!db.objectStoreNames.contains('encryptedItems')) {
          const store = db.createObjectStore('encryptedItems', { keyPath: 'id' });
          store.createIndex('by-vault', 'vaultId');
          store.createIndex('by-user', 'userId');
        }
        if (!db.objectStoreNames.contains('passkeys')) {
          const store = db.createObjectStore('passkeys', { keyPath: 'id' });
          store.createIndex('by-vault', 'vaultId');
        }
        if (!db.objectStoreNames.contains('recoveryConfigs')) {
          db.createObjectStore('recoveryConfigs', { keyPath: 'vaultId' });
        }
        if (!db.objectStoreNames.contains('deviceSessions')) {
          const store = db.createObjectStore('deviceSessions', { keyPath: 'id' });
          store.createIndex('by-user', 'userId');
        }
        if (!db.objectStoreNames.contains('securityEvents')) {
          const store = db.createObjectStore('securityEvents', { keyPath: 'id' });
          store.createIndex('by-user', 'userId');
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('appState')) {
          db.createObjectStore('appState', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('aiConversations')) {
          const store = db.createObjectStore('aiConversations', { keyPath: 'id' });
          store.createIndex('by-vault', 'vaultId');
        }
      },
    });
  }
  return dbPromise;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoLockMinutes: 5,
  clipboardClearSeconds: 30,
  confirmSensitiveReveal: true,
  enablePaymentCategory: false,
  cloudAiEnabled: false,
};

export async function setActiveLocalSessionEmail(email: string | null): Promise<void> {
  const db = await getEncryptedDb();
  if (!email) {
    await db.delete('appState', 'active_local_email');
  } else {
    await db.put('appState', { key: 'active_local_email', value: email });
  }
}

export async function getActiveLocalSessionEmail(): Promise<string | null> {
  const db = await getEncryptedDb();
  const row = await db.get('appState', 'active_local_email');
  return row?.value ?? null;
}

export async function cacheEncryptedItemsToIdb(
  items: EncryptedVaultItemRecord[],
): Promise<void> {
  const db = await getEncryptedDb();
  const tx = db.transaction('encryptedItems', 'readwrite');
  for (const item of items) {
    await tx.store.put(item);
  }
  await tx.done;
}

export async function getCachedEncryptedItems(
  vaultId: string,
): Promise<EncryptedVaultItemRecord[]> {
  const db = await getEncryptedDb();
  return db.getAllFromIndex('encryptedItems', 'by-vault', vaultId);
}

export async function putEncryptedAiConversation(
  record: EncryptedAiConversationRecord,
): Promise<void> {
  const db = await getEncryptedDb();
  await db.put('aiConversations', record);
}

export async function getEncryptedAiConversations(
  vaultId: string,
): Promise<EncryptedAiConversationRecord[]> {
  const db = await getEncryptedDb();
  return db.getAllFromIndex('aiConversations', 'by-vault', vaultId);
}

export async function deleteEncryptedAiConversation(id: string): Promise<void> {
  const db = await getEncryptedDb();
  await db.delete('aiConversations', id);
}

