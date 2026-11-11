import {
  deriveKeyArgon2id,
  getDefaultKdfParams,
  type KdfProfile,
} from '../cryptography/argon2';
import {
  decryptAesGcmWithKey,
  encryptAesGcmWithKey,
  generateRandomBytes,
  zeroizeBytes,
} from '../cryptography/cryptoEngine';
import {
  base64ToBytes,
  bytesToBase64,
  utf8ToBytes,
} from '../cryptography/encoding';
import {
  deleteLocalPinEnvelope,
  getLocalPinEnvelope,
  putLocalPinEnvelope,
} from '@/lib/storage/indexedDbStore';
import type { LocalPinEnvelopeRecord } from '@/types/vault';

export const QUICK_PIN_MAX_ATTEMPTS = 5;

export class QuickPinWipedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuickPinWipedError';
  }
}

export function isValidFourDigitPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

function buildPinAad(userId: string, vaultId: string): Uint8Array {
  return utf8ToBytes(`keynest:device-pin:v1:${userId}:${vaultId}`);
}

/**
 * Wraps the active 256-bit VEK using a 4-digit PIN bound to a device-local random secret
 * via Argon2id + AES-256-GCM. Stored strictly inside local IndexedDB (never synced to cloud).
 */
export async function enableQuickPinOnDevice(params: {
  userId: string;
  vaultId: string;
  vek: Uint8Array;
  pin: string;
  kdfProfile?: KdfProfile;
}): Promise<LocalPinEnvelopeRecord> {
  if (!isValidFourDigitPin(params.pin)) {
    throw new Error('Quick PIN must be exactly 4 digits (0–9).');
  }
  if (params.vek.length !== 32) {
    throw new Error('Vault must be unlocked to set up Quick PIN.');
  }

  const salt = generateRandomBytes(16);
  const deviceSecretBytes = generateRandomBytes(32);
  const deviceSecret = bytesToBase64(deviceSecretBytes);
  const kdfParams = getDefaultKdfParams(params.kdfProfile);
  const kekBytes = await deriveKeyArgon2id(
    `${params.pin}:${deviceSecret}`,
    salt,
    kdfParams,
  );

  try {
    const subtle = globalThis.crypto.subtle;
    const copy = new Uint8Array(kekBytes.byteLength);
    copy.set(kekBytes);
    const aesKek = await subtle.importKey(
      'raw',
      copy.buffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );
    const { ciphertext, nonce } = await encryptAesGcmWithKey(
      aesKek,
      params.vek,
      buildPinAad(params.userId, params.vaultId),
    );
    const now = new Date().toISOString();
    const record: LocalPinEnvelopeRecord = {
      vaultKey: `${params.userId}:${params.vaultId}`,
      userId: params.userId,
      vaultId: params.vaultId,
      salt: bytesToBase64(salt),
      kdfParams,
      deviceSecret,
      wrappedVek: bytesToBase64(ciphertext),
      nonce: bytesToBase64(nonce),
      failedAttempts: 0,
      maxAttempts: QUICK_PIN_MAX_ATTEMPTS,
      createdAt: now,
      updatedAt: now,
    };

    await putLocalPinEnvelope(record);
    return record;
  } finally {
    zeroizeBytes(kekBytes);
  }
}

export async function hasQuickPinOnDevice(
  userId: string,
  vaultId: string,
): Promise<boolean> {
  const existing = await getLocalPinEnvelope(userId, vaultId);
  return Boolean(existing);
}

export async function disableQuickPinOnDevice(
  userId: string,
  vaultId: string,
): Promise<void> {
  await deleteLocalPinEnvelope(userId, vaultId);
}

/**
 * Unwraps the VEK using the device-local 4-digit PIN.
 * Enforces a strict 5-attempt limit; on the 5th failed attempt, permanently destroys
 * the local PIN envelope so Master Password is required.
 */
export async function unlockWithQuickPinOnDevice(params: {
  userId: string;
  vaultId: string;
  pin: string;
}): Promise<Uint8Array> {
  if (!isValidFourDigitPin(params.pin)) {
    throw new Error('Enter a valid 4-digit PIN.');
  }

  const record = await getLocalPinEnvelope(params.userId, params.vaultId);
  if (!record) {
    throw new QuickPinWipedError(
      'Quick PIN is not configured on this device. Please unlock with your Master Password.',
    );
  }

  const kekBytes = await deriveKeyArgon2id(
    `${params.pin}:${record.deviceSecret}`,
    base64ToBytes(record.salt),
    record.kdfParams,
  );

  try {
    const subtle = globalThis.crypto.subtle;
    const copy = new Uint8Array(kekBytes.byteLength);
    copy.set(kekBytes);
    const aesKek = await subtle.importKey(
      'raw',
      copy.buffer,
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    const vek = await decryptAesGcmWithKey(
      aesKek,
      base64ToBytes(record.wrappedVek),
      base64ToBytes(record.nonce),
      buildPinAad(params.userId, params.vaultId),
    );
    if (vek.length !== 32) {
      throw new Error('Invalid VEK length.');
    }

    if (record.failedAttempts > 0) {
      await putLocalPinEnvelope({
        ...record,
        failedAttempts: 0,
        updatedAt: new Date().toISOString(),
      });
    }
    return vek;
  } catch {
    const nextFailed = record.failedAttempts + 1;
    if (nextFailed >= record.maxAttempts) {
      await deleteLocalPinEnvelope(params.userId, params.vaultId);
      throw new QuickPinWipedError(
        'Too many incorrect PIN attempts (5/5). Quick PIN has been cleared on this device — unlock with your Master Password.',
      );
    }

    await putLocalPinEnvelope({
      ...record,
      failedAttempts: nextFailed,
      updatedAt: new Date().toISOString(),
    });
    const remaining = record.maxAttempts - nextFailed;
    throw new Error(
      `Incorrect PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before Quick PIN is cleared.`,
    );
  } finally {
    zeroizeBytes(kekBytes);
  }
}

