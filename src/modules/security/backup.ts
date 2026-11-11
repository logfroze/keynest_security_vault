import { deriveKeyArgon2id, getDefaultKdfParams, type KdfProfile } from '../cryptography/argon2';
import {
  decryptBackupBundle,
  encryptBackupBundle,
  generateRandomBytes,
  zeroizeBytes,
} from '../cryptography/cryptoEngine';
import { base64ToBytes, bytesToBase64 } from '../cryptography/encoding';
import { vaultItemPayloadSchema } from '../vault/schemas';
import type { DecryptedVaultItem, KdfParams, VaultItemPayload } from '@/types/vault';

export interface EncryptedVaultBackupFile {
  format: 'keynest-encrypted-backup-v1';
  exportedAt: string;
  vaultId: string;
  keyMode: 'vault-subkey' | 'passphrase';
  salt?: string;
  kdfParams?: KdfParams;
  nonce: string;
  ciphertext: string;
  itemCount: number;
}

interface BackupPlaintextPayload {
  version: 1;
  vaultId: string;
  exportedAt: string;
  items: Array<{
    id: string;
    createdAt: string;
    updatedAt: string;
    payload: VaultItemPayload;
  }>;
}

/**
 * Exports all active decrypted items into an authenticated AES-256-GCM encrypted backup JSON file.
 */
export async function exportEncryptedVaultBackup(params: {
  vaultId: string;
  items: DecryptedVaultItem[];
  vek: Uint8Array;
  backupPassphrase?: string;
  kdfProfile?: KdfProfile;
}): Promise<EncryptedVaultBackupFile> {
  const activeItems = params.items.filter((i) => i.deletedAt === null);
  const exportedAt = new Date().toISOString();

  const inner: BackupPlaintextPayload = {
    version: 1,
    vaultId: params.vaultId,
    exportedAt,
    items: activeItems.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      payload: item.payload,
    })),
  };

  if (params.backupPassphrase && params.backupPassphrase.trim().length > 0) {
    const salt = generateRandomBytes(16);
    const kdfParams = getDefaultKdfParams(params.kdfProfile);
    const kek = await deriveKeyArgon2id(params.backupPassphrase, salt, kdfParams);
    try {
      const { ciphertext, nonce } = await encryptBackupBundle(kek, inner, false);
      return {
        format: 'keynest-encrypted-backup-v1',
        exportedAt,
        vaultId: params.vaultId,
        keyMode: 'passphrase',
        salt: bytesToBase64(salt),
        kdfParams,
        nonce,
        ciphertext,
        itemCount: activeItems.length,
      };
    } finally {
      zeroizeBytes(kek);
    }
  }

  const { ciphertext, nonce } = await encryptBackupBundle(params.vek, inner, true);
  return {
    format: 'keynest-encrypted-backup-v1',
    exportedAt,
    vaultId: params.vaultId,
    keyMode: 'vault-subkey',
    nonce,
    ciphertext,
    itemCount: activeItems.length,
  };
}

/**
 * Decrypts and validates a KeyNest encrypted backup file.
 */
export async function restoreEncryptedVaultBackup(params: {
  backup: EncryptedVaultBackupFile;
  vek?: Uint8Array;
  backupPassphrase?: string;
}): Promise<BackupPlaintextPayload> {
  if (params.backup.format !== 'keynest-encrypted-backup-v1') {
    throw new Error('Unsupported backup file format.');
  }

  let decrypted: BackupPlaintextPayload;

  if (params.backup.keyMode === 'passphrase') {
    if (!params.backupPassphrase) {
      throw new Error('This backup requires its backup passphrase.');
    }
    if (!params.backup.salt) {
      throw new Error('Backup salt metadata is missing.');
    }
    const kek = await deriveKeyArgon2id(
      params.backupPassphrase,
      base64ToBytes(params.backup.salt),
      params.backup.kdfParams,
    );
    try {
      decrypted = await decryptBackupBundle<BackupPlaintextPayload>(
        kek,
        params.backup.ciphertext,
        params.backup.nonce,
        false,
      );
    } catch {
      throw new Error('Incorrect backup passphrase or corrupted backup file.');
    } finally {
      zeroizeBytes(kek);
    }
  } else {
    if (!params.vek) {
      throw new Error('Vault must be unlocked with the original Vault Key to restore this backup.');
    }
    try {
      decrypted = await decryptBackupBundle<BackupPlaintextPayload>(
        params.vek,
        params.backup.ciphertext,
        params.backup.nonce,
        true,
      );
    } catch {
      throw new Error('Failed to decrypt backup with current Vault Key.');
    }
  }

  // Validate every restored item payload against Zod schema
  const validatedItems = decrypted.items.map((entry) => ({
    ...entry,
    payload: vaultItemPayloadSchema.parse(entry.payload),
  }));

  return {
    ...decrypted,
    items: validatedItems,
  };
}

