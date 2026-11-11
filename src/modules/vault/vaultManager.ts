import { decryptPayload, encryptPayload } from '../cryptography/cryptoEngine';
import { vaultItemPayloadSchema } from './schemas';
import type {
  DecryptedVaultItem,
  EncryptedVaultItemRecord,
  VaultItemPayload,
} from '@/types/vault';

export const CURRENT_ENCRYPTION_VERSION = 1;

export function generateUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Encrypts a new vault item locally using the unlocked VEK and item-bound AAD.
 */
export async function createEncryptedVaultItem(params: {
  vek: Uint8Array;
  userId: string;
  vaultId: string;
  payload: VaultItemPayload;
  itemId?: string;
}): Promise<{ encrypted: EncryptedVaultItemRecord; decrypted: DecryptedVaultItem }> {
  const validated = vaultItemPayloadSchema.parse(params.payload);
  const now = new Date().toISOString();
  const id = params.itemId ?? generateUuid();
  const encryptionVersion = CURRENT_ENCRYPTION_VERSION;

  const { encryptedPayload, nonce } = await encryptPayload(params.vek, validated, {
    userId: params.userId,
    vaultId: params.vaultId,
    itemId: id,
    encryptionVersion,
  });

  const encrypted: EncryptedVaultItemRecord = {
    id,
    userId: params.userId,
    vaultId: params.vaultId,
    encryptedPayload,
    nonce,
    encryptionVersion,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const decrypted: DecryptedVaultItem = {
    id,
    userId: params.userId,
    vaultId: params.vaultId,
    revision: 1,
    encryptionVersion,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    payload: validated,
  };

  return { encrypted, decrypted };
}

/**
 * Encrypts an updated vault item, recording password history when primary password/secret changes
 * and incrementing `revision` for optimistic concurrency control.
 */
export async function updateEncryptedVaultItem(params: {
  vek: Uint8Array;
  existing: DecryptedVaultItem;
  nextPayload: VaultItemPayload;
  deletedAt?: string | null;
}): Promise<{ encrypted: EncryptedVaultItemRecord; decrypted: DecryptedVaultItem }> {
  const validated = vaultItemPayloadSchema.parse(params.nextPayload);
  const now = new Date().toISOString();

  // Track password history when a password field changes
  const prevPassword = params.existing.payload.fields.password;
  const nextPassword = validated.fields.password;
  let passwordHistory = validated.passwordHistory ?? params.existing.payload.passwordHistory ?? [];

  if (prevPassword && nextPassword && prevPassword !== nextPassword) {
    passwordHistory = [
      { value: prevPassword, changedAt: now },
      ...passwordHistory.filter((h) => h.value !== prevPassword),
    ].slice(0, 10);
  }

  const finalPayload: VaultItemPayload = {
    ...validated,
    passwordHistory,
  };

  const nextRevision = params.existing.revision + 1;
  const { encryptedPayload, nonce } = await encryptPayload(params.vek, finalPayload, {
    userId: params.existing.userId,
    vaultId: params.existing.vaultId,
    itemId: params.existing.id,
    encryptionVersion: params.existing.encryptionVersion,
  });

  const deletedAt =
    params.deletedAt !== undefined ? params.deletedAt : params.existing.deletedAt;

  const encrypted: EncryptedVaultItemRecord = {
    id: params.existing.id,
    userId: params.existing.userId,
    vaultId: params.existing.vaultId,
    encryptedPayload,
    nonce,
    encryptionVersion: params.existing.encryptionVersion,
    revision: nextRevision,
    createdAt: params.existing.createdAt,
    updatedAt: now,
    deletedAt,
  };

  const decrypted: DecryptedVaultItem = {
    id: params.existing.id,
    userId: params.existing.userId,
    vaultId: params.existing.vaultId,
    revision: nextRevision,
    encryptionVersion: params.existing.encryptionVersion,
    createdAt: params.existing.createdAt,
    updatedAt: now,
    deletedAt,
    payload: finalPayload,
  };

  return { encrypted, decrypted };
}

export async function decryptVaultItem(
  vek: Uint8Array,
  record: EncryptedVaultItemRecord,
): Promise<DecryptedVaultItem> {
  const payload = await decryptPayload<VaultItemPayload>(
    vek,
    record.encryptedPayload,
    record.nonce,
    {
      userId: record.userId,
      vaultId: record.vaultId,
      itemId: record.id,
      encryptionVersion: record.encryptionVersion,
    },
  );

  return {
    id: record.id,
    userId: record.userId,
    vaultId: record.vaultId,
    revision: record.revision,
    encryptionVersion: record.encryptionVersion,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
    payload: {
      ...payload,
      customFields: payload.customFields ?? [],
      tags: payload.tags ?? [],
      notes: payload.notes ?? '',
      favorite: Boolean(payload.favorite),
    },
  };
}

export async function decryptVaultItems(
  vek: Uint8Array,
  records: EncryptedVaultItemRecord[],
): Promise<{ items: DecryptedVaultItem[]; failedIds: string[] }> {
  const items: DecryptedVaultItem[] = [];
  const failedIds: string[] = [];

  for (const record of records) {
    try {
      const decrypted = await decryptVaultItem(vek, record);
      items.push(decrypted);
    } catch {
      failedIds.push(record.id);
    }
  }

  return { items, failedIds };
}

