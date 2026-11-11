import {
  deriveKeyArgon2id,
  getDefaultKdfParams,
  type KdfProfile,
} from '../cryptography/argon2';
import {
  generateRandomBytes,
  generateVek,
  unwrapVek,
  wrapVek,
  zeroizeBytes,
} from '../cryptography/cryptoEngine';
import { base64ToBytes, bytesToBase64 } from '../cryptography/encoding';
import {
  computeRecoveryFingerprint,
  deriveRecoveryKek,
  generateRecoveryKey,
} from './recovery';
import type { VaultKeyEnvelope } from '@/types/vault';

export interface NewEnvelopeInput {
  userId: string;
  vaultId: string;
  method: 'master' | 'recovery';
  credentialId?: string | null;
  salt: string;
  kdfParams: VaultKeyEnvelope['kdfParams'];
  wrappedVek: string;
  nonce: string;
  keyVersion: number;
}

export interface InitializedVaultCrypto {
  vek: Uint8Array;
  masterEnvelope: NewEnvelopeInput;
  recoveryEnvelope: NewEnvelopeInput;
  recoveryKey: string;
  recoveryFingerprint: string;
}

/**
 * Creates a new random 256-bit VEK and wraps it independently for both Master Password
 * and a freshly generated Recovery Key.
 */
export async function initializeVaultKeys(params: {
  userId: string;
  vaultId: string;
  masterPassword: string;
  kdfProfile?: KdfProfile;
}): Promise<InitializedVaultCrypto> {
  if (params.masterPassword.length < 8) {
    throw new Error('Master password must be at least 8 characters long.');
  }

  const vek = generateVek();
  const kdfParams = getDefaultKdfParams(params.kdfProfile);
  const masterSalt = generateRandomBytes(16);
  const masterKek = await deriveKeyArgon2id(params.masterPassword, masterSalt, kdfParams);

  let masterWrapped: { wrappedVek: string; nonce: string };
  try {
    masterWrapped = await wrapVek(masterKek, vek, {
      userId: params.userId,
      vaultId: params.vaultId,
      method: 'master',
      keyVersion: 1,
    });
  } finally {
    zeroizeBytes(masterKek);
  }

  const recoveryKey = generateRecoveryKey();
  const recoveryFingerprint = await computeRecoveryFingerprint(recoveryKey);
  const recoverySalt = generateRandomBytes(16);
  const { kek: recoveryKek, kdfParams: recoveryKdfParams } = await deriveRecoveryKek(
    recoveryKey,
    recoverySalt,
    kdfParams,
    params.kdfProfile,
  );

  let recoveryWrapped: { wrappedVek: string; nonce: string };
  try {
    recoveryWrapped = await wrapVek(recoveryKek, vek, {
      userId: params.userId,
      vaultId: params.vaultId,
      method: 'recovery',
      keyVersion: 1,
    });
  } finally {
    zeroizeBytes(recoveryKek);
  }

  return {
    vek,
    recoveryKey,
    recoveryFingerprint,
    masterEnvelope: {
      userId: params.userId,
      vaultId: params.vaultId,
      method: 'master',
      credentialId: null,
      salt: bytesToBase64(masterSalt),
      kdfParams,
      wrappedVek: masterWrapped.wrappedVek,
      nonce: masterWrapped.nonce,
      keyVersion: 1,
    },
    recoveryEnvelope: {
      userId: params.userId,
      vaultId: params.vaultId,
      method: 'recovery',
      credentialId: null,
      salt: bytesToBase64(recoverySalt),
      kdfParams: recoveryKdfParams,
      wrappedVek: recoveryWrapped.wrappedVek,
      nonce: recoveryWrapped.nonce,
      keyVersion: 1,
    },
  };
}

/**
 * Unwraps the VEK using the user's Master Password and the stored `master` key envelope.
 */
export async function unlockWithMasterPassword(params: {
  masterPassword: string;
  envelope: VaultKeyEnvelope;
}): Promise<Uint8Array> {
  if (params.envelope.method !== 'master') {
    throw new Error('Expected master key envelope');
  }
  const salt = base64ToBytes(params.envelope.salt);
  const kek = await deriveKeyArgon2id(
    params.masterPassword,
    salt,
    params.envelope.kdfParams,
  );

  try {
    return await unwrapVek(kek, params.envelope.wrappedVek, params.envelope.nonce, {
      userId: params.envelope.userId,
      vaultId: params.envelope.vaultId,
      method: 'master',
      keyVersion: params.envelope.keyVersion,
    });
  } catch {
    throw new Error('Incorrect master password or corrupted vault envelope.');
  } finally {
    zeroizeBytes(kek);
  }
}

/**
 * Unwraps the VEK using the user's one-time Recovery Key.
 */
export async function unlockWithRecoveryKey(params: {
  recoveryKey: string;
  envelope: VaultKeyEnvelope;
}): Promise<Uint8Array> {
  if (params.envelope.method !== 'recovery') {
    throw new Error('Expected recovery key envelope');
  }
  const salt = base64ToBytes(params.envelope.salt);
  const { kek } = await deriveRecoveryKek(
    params.recoveryKey,
    salt,
    params.envelope.kdfParams,
  );

  try {
    return await unwrapVek(kek, params.envelope.wrappedVek, params.envelope.nonce, {
      userId: params.envelope.userId,
      vaultId: params.envelope.vaultId,
      method: 'recovery',
      keyVersion: params.envelope.keyVersion,
    });
  } catch {
    throw new Error('Invalid recovery key. Please verify every character and try again.');
  } finally {
    zeroizeBytes(kek);
  }
}

/**
 * Rotates the Master Password by re-wrapping the existing VEK with a newly derived KEK.
 * Existing encrypted vault_items remain intact without re-encryption.
 */
export async function rotateMasterPassword(params: {
  currentVek: Uint8Array;
  newMasterPassword: string;
  userId: string;
  vaultId: string;
  nextKeyVersion: number;
  kdfProfile?: KdfProfile;
}): Promise<NewEnvelopeInput> {
  if (params.newMasterPassword.length < 8) {
    throw new Error('New master password must be at least 8 characters long.');
  }
  const kdfParams = getDefaultKdfParams(params.kdfProfile);
  const salt = generateRandomBytes(16);
  const newKek = await deriveKeyArgon2id(params.newMasterPassword, salt, kdfParams);

  try {
    const wrapped = await wrapVek(newKek, params.currentVek, {
      userId: params.userId,
      vaultId: params.vaultId,
      method: 'master',
      keyVersion: params.nextKeyVersion,
    });

    return {
      userId: params.userId,
      vaultId: params.vaultId,
      method: 'master',
      credentialId: null,
      salt: bytesToBase64(salt),
      kdfParams,
      wrappedVek: wrapped.wrappedVek,
      nonce: wrapped.nonce,
      keyVersion: params.nextKeyVersion,
    };
  } finally {
    zeroizeBytes(newKek);
  }
}

/**
 * Generates a fresh Recovery Key and re-wraps the current VEK.
 */
export async function rotateRecoveryKey(params: {
  currentVek: Uint8Array;
  userId: string;
  vaultId: string;
  nextKeyVersion: number;
  kdfProfile?: KdfProfile;
}): Promise<{
  recoveryKey: string;
  recoveryFingerprint: string;
  recoveryEnvelope: NewEnvelopeInput;
}> {
  const recoveryKey = generateRecoveryKey();
  const recoveryFingerprint = await computeRecoveryFingerprint(recoveryKey);
  const salt = generateRandomBytes(16);
  const { kek, kdfParams } = await deriveRecoveryKek(
    recoveryKey,
    salt,
    undefined,
    params.kdfProfile,
  );

  try {
    const wrapped = await wrapVek(kek, params.currentVek, {
      userId: params.userId,
      vaultId: params.vaultId,
      method: 'recovery',
      keyVersion: params.nextKeyVersion,
    });
    return {
      recoveryKey,
      recoveryFingerprint,
      recoveryEnvelope: {
        userId: params.userId,
        vaultId: params.vaultId,
        method: 'recovery',
        credentialId: null,
        salt: bytesToBase64(salt),
        kdfParams,
        wrappedVek: wrapped.wrappedVek,
        nonce: wrapped.nonce,
        keyVersion: params.nextKeyVersion,
      },
    };
  } finally {
    zeroizeBytes(kek);
  }
}

