export type VaultCategory =
  | 'login'
  | 'developer_secret'
  | 'financial'
  | 'personal'
  | 'payment'
  | 'secure_note'
  | 'custom';

export type CustomFieldType =
  | 'text'
  | 'password'
  | 'email'
  | 'url'
  | 'date'
  | 'number';

export interface CustomField {
  id: string;
  label: string;
  type: CustomFieldType;
  value: string;
}

export interface PasswordHistoryEntry {
  value: string;
  changedAt: string;
}

export interface VaultItemPayload {
  title: string;
  category: VaultCategory;
  customCategoryName?: string;
  fields: Record<string, string>;
  customFields: CustomField[];
  tags: string[];
  notes: string;
  favorite: boolean;
  icon?: string;
  passwordHistory?: PasswordHistoryEntry[];
  lastUsedAt?: string;
}

export interface EncryptedVaultItemRecord {
  id: string;
  userId: string;
  vaultId: string;
  encryptedPayload: string; // base64 ciphertext
  nonce: string; // base64 12-byte IV
  encryptionVersion: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DecryptedVaultItem {
  id: string;
  userId: string;
  vaultId: string;
  revision: number;
  encryptionVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  payload: VaultItemPayload;
}

export type KeyEnvelopeMethod = 'master' | 'passkey' | 'recovery';

export interface KdfParams {
  algorithm: 'argon2id' | 'webauthn-prf';
  memorySize?: number; // KiB
  iterations?: number;
  parallelism?: number;
  hashLength?: number;
  prfSalt?: string;
}

export interface VaultKeyEnvelope {
  id: string;
  userId: string;
  vaultId: string;
  method: KeyEnvelopeMethod;
  credentialId?: string | null;
  salt: string; // base64
  kdfParams: KdfParams;
  wrappedVek: string; // base64 AES-256-GCM ciphertext
  nonce: string; // base64 12-byte IV
  keyVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface VaultMetadata {
  id: string;
  userId: string;
  name: string;
  encryptionVersion: number;
  kdfAlgorithm: string;
  createdAt: string;
  updatedAt: string;
}

export interface PasskeyCredentialRecord {
  id: string;
  userId: string;
  vaultId: string;
  credentialId: string;
  label: string;
  prfEnabled: boolean;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface RecoveryConfigRecord {
  id: string;
  userId: string;
  vaultId: string;
  keyFingerprint: string;
  verifiedAt: string | null;
  rotatedAt: string;
}

export interface DeviceSessionRecord {
  id: string;
  userId: string;
  deviceLabel: string;
  userAgent: string | null;
  lastSeenAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export type SecurityEventType =
  | 'account_created'
  | 'vault_initialized'
  | 'vault_unlocked'
  | 'unlock_failed'
  | 'vault_locked'
  | 'master_password_changed'
  | 'passkey_added'
  | 'passkey_removed'
  | 'recovery_key_rotated'
  | 'recovery_unlock_used'
  | 'backup_exported'
  | 'backup_restored'
  | 'item_conflict_detected'
  | 'cloud_ai_toggled';

export interface SecurityEventRecord {
  id: string;
  userId: string;
  vaultId: string | null;
  eventType: SecurityEventType;
  deviceLabel: string | null;
  metadata: Record<string, string | number | boolean>;
  createdAt: string;
}

export interface UserPreferences {
  autoLockMinutes: number; // 0 = never
  clipboardClearSeconds: number; // 0 = off
  confirmSensitiveReveal: boolean;
  enablePaymentCategory: boolean;
  cloudAiEnabled: boolean;
  cloudAiProvider?: 'openai' | 'gemini';
}

export interface UserProfile {
  id: string;
  email: string;
  displayName?: string | null;
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface SyncConflict {
  itemId: string;
  localItem: DecryptedVaultItem;
  remoteEncrypted: EncryptedVaultItemRecord;
  remoteDecrypted: DecryptedVaultItem | null;
  detectedAt: string;
}

export type StorageBackendMode = 'supabase' | 'local';

export interface EncryptedAiConversationRecord {
  id: string;
  vaultId: string;
  encryptedPayload: string;
  nonce: string;
  updatedAt: string;
}

export interface AiChatMessageRecord {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  source?: 'local' | 'gemini';
  model?: string;
  matchedItemIds?: string[];
  pendingActionJson?: string | null;
  actionStatus?: 'pending' | 'executed' | 'dismissed';
  createdAt: string;
}

export interface AiConversationThread {
  id: string;
  title: string;
  updatedAt: string;
  messages: AiChatMessageRecord[];
}

