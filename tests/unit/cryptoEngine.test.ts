import { describe, expect, it } from 'vitest';
import { deriveKeyArgon2id } from '@/modules/cryptography/argon2';
import {
  decryptPayload,
  deriveSubkeyHkdf,
  encryptAesGcmWithKey,
  encryptPayload,
  generateRandomBytes,
  generateVek,
  wrapVek,
  unwrapVek,
} from '@/modules/cryptography/cryptoEngine';
import { utf8ToBytes } from '@/modules/cryptography/encoding';
import {
  evaluatePasswordStrength,
  generateStrongPassword,
} from '@/modules/cryptography/password';

describe('Cryptography Engine', () => {
  it('derives deterministic 32-byte keys with Argon2id and differs across salts', async () => {
    const saltA = generateRandomBytes(16);
    const saltB = generateRandomBytes(16);
    const params = { memorySize: 16384, iterations: 2, parallelism: 1, hashLength: 32 };

    const k1 = await deriveKeyArgon2id('correct-horse-battery-staple', saltA, params);
    const k2 = await deriveKeyArgon2id('correct-horse-battery-staple', saltA, params);
    const k3 = await deriveKeyArgon2id('correct-horse-battery-staple', saltB, params);

    expect(k1).toHaveLength(32);
    expect(Buffer.from(k1).equals(Buffer.from(k2))).toBe(true);
    expect(Buffer.from(k1).equals(Buffer.from(k3))).toBe(false);
  });

  it('encrypts and decrypts payloads with AES-256-GCM and enforces AAD binding', async () => {
    const vek = generateVek();
    const ctx = {
      userId: 'user-1',
      vaultId: 'vault-1',
      itemId: 'item-1',
      encryptionVersion: 1,
    };

    const secretPayload = {
      title: 'GitHub',
      category: 'developer_secret',
      fields: { apiKey: 'ghp_superSecret123456' },
    };

    const enc1 = await encryptPayload(vek, secretPayload, ctx);
    const enc2 = await encryptPayload(vek, secretPayload, ctx);

    // Unique nonce and ciphertext on every encryption
    expect(enc1.nonce).not.toBe(enc2.nonce);
    expect(enc1.encryptedPayload).not.toBe(enc2.encryptedPayload);

    // Ciphertext must not contain plaintext fields
    expect(enc1.encryptedPayload).not.toContain('GitHub');
    expect(enc1.encryptedPayload).not.toContain('ghp_superSecret123456');

    const decrypted = await decryptPayload<typeof secretPayload>(
      vek,
      enc1.encryptedPayload,
      enc1.nonce,
      ctx,
    );
    expect(decrypted).toEqual(secretPayload);

    // AAD mismatch must reject decryption (cross-user or cross-item tampering)
    await expect(
      decryptPayload(vek, enc1.encryptedPayload, enc1.nonce, {
        ...ctx,
        userId: 'user-2',
      }),
    ).rejects.toThrow();

    await expect(
      decryptPayload(vek, enc1.encryptedPayload, enc1.nonce, {
        ...ctx,
        itemId: 'item-999',
      }),
    ).rejects.toThrow();
  });

  it('isolates HKDF subkeys by purpose', async () => {
    const vek = generateVek();
    const itemsKey = await deriveSubkeyHkdf(vek, 'items');
    const exportKey = await deriveSubkeyHkdf(vek, 'export');
    const aad = utf8ToBytes('test-aad');

    const { ciphertext, nonce } = await encryptAesGcmWithKey(
      itemsKey,
      utf8ToBytes('hello-keynest'),
      aad,
    );

    const { decryptAesGcmWithKey } = await import('@/modules/cryptography/cryptoEngine');
    await expect(
      decryptAesGcmWithKey(exportKey, ciphertext, nonce, aad),
    ).rejects.toThrow();
  });

  it('wraps and unwraps VEK with AAD validation', async () => {
    const kek = generateRandomBytes(32);
    const vek = generateVek();
    const ctx = {
      userId: 'u1',
      vaultId: 'v1',
      method: 'master' as const,
      keyVersion: 1,
    };
    const wrapped = await wrapVek(kek, vek, ctx);
    const unwrapped = await unwrapVek(kek, wrapped.wrappedVek, wrapped.nonce, ctx);
    expect(Buffer.from(unwrapped).equals(Buffer.from(vek))).toBe(true);

    await expect(
      unwrapVek(generateRandomBytes(32), wrapped.wrappedVek, wrapped.nonce, ctx),
    ).rejects.toThrow();
  });

  it('generates strong passwords and scores weak vs strong accurately', () => {
    const generated = generateStrongPassword({ length: 24 });
    expect(generated).toHaveLength(24);
    expect(evaluatePasswordStrength(generated).score).toBe(4);
    expect(evaluatePasswordStrength('password123').score).toBeLessThanOrEqual(2);
  });
});

