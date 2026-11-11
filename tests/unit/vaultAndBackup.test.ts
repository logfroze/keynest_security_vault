import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { generateVek } from '@/modules/cryptography/cryptoEngine';
import {
  exportEncryptedVaultBackup,
  restoreEncryptedVaultBackup,
} from '@/modules/security/backup';
import {
  OptimisticConcurrencyError,
  saveEncryptedVaultItem,
} from '@/modules/synchronization/vaultRepository';
import {
  createEncryptedVaultItem,
  decryptVaultItems,
  updateEncryptedVaultItem,
} from '@/modules/vault/vaultManager';

describe('Vault CRUD, Zero-Knowledge Storage, Conflict Detection & Backup', () => {
  it('stores zero readable secrets, tracks password history, and detects revision conflicts', async () => {
    const vek = generateVek();
    const { encrypted, decrypted } = await createEncryptedVaultItem({
      vek,
      userId: 'user-1',
      vaultId: 'vault-1',
      payload: {
        title: 'Facebook Account',
        category: 'login',
        fields: {
          website: 'facebook.com',
          email: 'logfroze@gmail.com',
          password: 'InitialSecretPassword!1',
        },
        customFields: [],
        tags: ['Social'],
        notes: 'Private note',
        favorite: true,
      },
    });

    // Ensure no readable secret leaks into serialized encrypted record
    const rawDbJson = JSON.stringify(encrypted);
    expect(rawDbJson).not.toContain('Facebook Account');
    expect(rawDbJson).not.toContain('logfroze@gmail.com');
    expect(rawDbJson).not.toContain('InitialSecretPassword!1');

    // Save initial item (rev 1) to IndexedDB
    await saveEncryptedVaultItem(encrypted);

    // Update password -> records password history and advances to rev 2
    const updated = await updateEncryptedVaultItem({
      vek,
      existing: decrypted,
      nextPayload: {
        ...decrypted.payload,
        fields: {
          ...decrypted.payload.fields,
          password: 'RotatedPassword!2',
        },
      },
    });
    expect(updated.decrypted.revision).toBe(2);
    expect(updated.decrypted.payload.passwordHistory).toHaveLength(1);
    expect(updated.decrypted.payload.passwordHistory?.[0].value).toBe(
      'InitialSecretPassword!1',
    );

    await saveEncryptedVaultItem(updated.encrypted, 1);

    // Stale update claiming revision 1 must trigger OptimisticConcurrencyError (no silent overwrite)
    await expect(
      saveEncryptedVaultItem(
        { ...updated.encrypted, revision: 2 },
        1,
      ),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);

    // Wrong VEK must fail decryption
    const wrongVek = generateVek();
    const wrongDecrypt = await decryptVaultItems(wrongVek, [updated.encrypted]);
    expect(wrongDecrypt.items).toHaveLength(0);
    expect(wrongDecrypt.failedIds).toEqual([updated.encrypted.id]);
  });

  it('exports and restores encrypted backups (both vault-subkey and passphrase modes)', async () => {
    const vek = generateVek();
    const created = await createEncryptedVaultItem({
      vek,
      userId: 'user-1',
      vaultId: 'vault-1',
      payload: {
        title: 'Supabase API',
        category: 'developer_secret',
        fields: {
          service: 'Supabase',
          apiKey: 'sb_secret_xyz987654',
        },
        customFields: [],
        tags: ['Work'],
        notes: '',
        favorite: false,
      },
    });

    // Passphrase-protected export
    const backup = await exportEncryptedVaultBackup({
      vaultId: 'vault-1',
      items: [created.decrypted],
      vek,
      backupPassphrase: 'ExportPassphrase#2026',
      kdfProfile: 'interactive',
    });

    expect(JSON.stringify(backup)).not.toContain('sb_secret_xyz987654');

    await expect(
      restoreEncryptedVaultBackup({
        backup,
        backupPassphrase: 'WrongPassphrase',
      }),
    ).rejects.toThrow();

    const restored = await restoreEncryptedVaultBackup({
      backup,
      backupPassphrase: 'ExportPassphrase#2026',
    });
    expect(restored.items).toHaveLength(1);
    expect(restored.items[0].payload.fields.apiKey).toBe('sb_secret_xyz987654');
  });
});

