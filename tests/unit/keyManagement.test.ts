import { describe, expect, it } from 'vitest';
import {
  decryptPayload,
  encryptPayload,
} from '@/modules/cryptography/cryptoEngine';
import {
  initializeVaultKeys,
  rotateMasterPassword,
  rotateRecoveryKey,
  unlockWithMasterPassword,
  unlockWithRecoveryKey,
} from '@/modules/key-management/keyManager';
import type { VaultKeyEnvelope } from '@/types/vault';

function toFullEnvelope(
  input: Awaited<ReturnType<typeof initializeVaultKeys>>['masterEnvelope'],
  id: string,
): VaultKeyEnvelope {
  const now = new Date().toISOString();
  return { ...input, id, createdAt: now, updatedAt: now };
}

describe('Key Management & Recovery', () => {
  it('initializes VEK, rejects wrong master password, and restores via recovery key', async () => {
    const setup = await initializeVaultKeys({
      userId: 'user-a',
      vaultId: 'vault-a',
      masterPassword: 'MyUltraStrongMaster!2026',
      kdfProfile: 'interactive',
    });

    const masterEnv = toFullEnvelope(setup.masterEnvelope, 'env-m');
    const recoveryEnv = toFullEnvelope(setup.recoveryEnvelope, 'env-r');

    // Correct master password unlocks VEK
    const unlockedMaster = await unlockWithMasterPassword({
      masterPassword: 'MyUltraStrongMaster!2026',
      envelope: masterEnv,
    });
    expect(Buffer.from(unlockedMaster).equals(Buffer.from(setup.vek))).toBe(true);

    // Wrong master password fails cleanly
    await expect(
      unlockWithMasterPassword({
        masterPassword: 'WrongPassword!',
        envelope: masterEnv,
      }),
    ).rejects.toThrow();

    // Recovery key independently restores exact VEK
    const unlockedRecovery = await unlockWithRecoveryKey({
      recoveryKey: setup.recoveryKey,
      envelope: recoveryEnv,
    });
    expect(Buffer.from(unlockedRecovery).equals(Buffer.from(setup.vek))).toBe(true);
  });

  it('rotates master password without re-encrypting existing vault items', async () => {
    const setup = await initializeVaultKeys({
      userId: 'user-a',
      vaultId: 'vault-a',
      masterPassword: 'OldPassword#2026',
      kdfProfile: 'interactive',
    });

    const itemCtx = {
      userId: 'user-a',
      vaultId: 'vault-a',
      itemId: 'item-1',
      encryptionVersion: 1,
    };
    const encryptedItem = await encryptPayload(
      setup.vek,
      { title: 'Bank Alfalah', secret: 'PK00ALFH12345' },
      itemCtx,
    );

    const rotatedInput = await rotateMasterPassword({
      currentVek: setup.vek,
      newMasterPassword: 'NewMasterPassword!2027',
      userId: 'user-a',
      vaultId: 'vault-a',
      nextKeyVersion: 2,
      kdfProfile: 'interactive',
    });
    const newMasterEnv = toFullEnvelope(rotatedInput, 'env-m');

    // Old password cannot unwrap new envelope
    await expect(
      unlockWithMasterPassword({
        masterPassword: 'OldPassword#2026',
        envelope: newMasterEnv,
      }),
    ).rejects.toThrow();

    // New password unwraps same VEK and decrypts previously encrypted item
    const unwrapped = await unlockWithMasterPassword({
      masterPassword: 'NewMasterPassword!2027',
      envelope: newMasterEnv,
    });
    const decrypted = await decryptPayload<{ title: string; secret: string }>(
      unwrapped,
      encryptedItem.encryptedPayload,
      encryptedItem.nonce,
      itemCtx,
    );
    expect(decrypted.title).toBe('Bank Alfalah');
    expect(decrypted.secret).toBe('PK00ALFH12345');
  });

  it('rotates recovery key and invalidates the old recovery key against new envelope', async () => {
    const setup = await initializeVaultKeys({
      userId: 'user-a',
      vaultId: 'vault-a',
      masterPassword: 'MasterPassword#2026',
      kdfProfile: 'interactive',
    });

    const rotated = await rotateRecoveryKey({
      currentVek: setup.vek,
      userId: 'user-a',
      vaultId: 'vault-a',
      nextKeyVersion: 2,
      kdfProfile: 'interactive',
    });
    const newRecEnv = toFullEnvelope(rotated.recoveryEnvelope, 'env-r');

    await expect(
      unlockWithRecoveryKey({
        recoveryKey: setup.recoveryKey,
        envelope: newRecEnv,
      }),
    ).rejects.toThrow();

    const recovered = await unlockWithRecoveryKey({
      recoveryKey: rotated.recoveryKey,
      envelope: newRecEnv,
    });
    expect(Buffer.from(recovered).equals(Buffer.from(setup.vek))).toBe(true);
  });
});

