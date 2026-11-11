import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  bytesToUtf8,
  utf8ToBytes,
} from './encoding';
import type { KeyEnvelopeMethod } from '@/types/vault';

export type KeyPurpose = 'items' | 'export' | 'meta';

export interface ItemAadContext {
  userId: string;
  vaultId: string;
  itemId: string;
  encryptionVersion: number;
}

export interface EnvelopeAadContext {
  userId: string;
  vaultId: string;
  method: KeyEnvelopeMethod;
  keyVersion: number;
}

const HKDF_DOMAIN_SALT = utf8ToBytes('keynest-hkdf-salt-v1');

const PURPOSE_INFO: Record<KeyPurpose, Uint8Array> = {
  items: utf8ToBytes('keynest-vault-items-v1'),
  export: utf8ToBytes('keynest-export-v1'),
  meta: utf8ToBytes('keynest-meta-v1'),
};

function getSubtle(): SubtleCrypto {
  if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment');
  }
  return globalThis.crypto.subtle;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function generateRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Generates a fresh 256-bit (32-byte) random Vault Encryption Key (VEK).
 */
export function generateVek(): Uint8Array {
  return generateRandomBytes(32);
}

/**
 * Overwrites sensitive byte arrays in-place when locking or rotating keys.
 */
export function zeroizeBytes(bytes: Uint8Array | null | undefined): void {
  if (!bytes) return;
  bytes.fill(0);
}

export function buildItemAad(ctx: ItemAadContext): Uint8Array {
  return utf8ToBytes(
    `keynest:v1:${ctx.userId}:${ctx.vaultId}:${ctx.itemId}:${ctx.encryptionVersion}`,
  );
}

export function buildEnvelopeAad(ctx: EnvelopeAadContext): Uint8Array {
  return utf8ToBytes(
    `keynest:envelope:v1:${ctx.userId}:${ctx.vaultId}:${ctx.method}:${ctx.keyVersion}`,
  );
}

/**
 * Derives a purpose-isolated AES-256-GCM CryptoKey from the raw VEK via HKDF-SHA-256.
 */
export async function deriveSubkeyHkdf(
  vek: Uint8Array,
  purpose: KeyPurpose,
): Promise<CryptoKey> {
  if (vek.length !== 32) {
    throw new Error('VEK must be exactly 32 bytes (256 bits)');
  }
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    'raw',
    toArrayBuffer(vek),
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  );

  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(HKDF_DOMAIN_SALT),
      info: toArrayBuffer(PURPOSE_INFO[purpose]),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptAesGcmWithKey(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const subtle = getSubtle();
  const nonce = generateRandomBytes(12); // Unique 96-bit nonce per operation
  const encrypted = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(aad),
      tagLength: 128,
    },
    key,
    toArrayBuffer(plaintext),
  );
  return {
    ciphertext: new Uint8Array(encrypted),
    nonce,
  };
}

export async function decryptAesGcmWithKey(
  key: CryptoKey,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  if (nonce.length !== 12) {
    throw new Error('AES-GCM nonce must be 12 bytes');
  }
  const subtle = getSubtle();
  const decrypted = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(aad),
      tagLength: 128,
    },
    key,
    toArrayBuffer(ciphertext),
  );
  return new Uint8Array(decrypted);
}

/**
 * Encrypts a JSON-serializable vault payload using the HKDF `items` subkey + AAD.
 */
export async function encryptPayload<T>(
  vek: Uint8Array,
  payload: T,
  aadCtx: ItemAadContext,
): Promise<{ encryptedPayload: string; nonce: string }> {
  const subkey = await deriveSubkeyHkdf(vek, 'items');
  const plaintext = utf8ToBytes(JSON.stringify(payload));
  const aad = buildItemAad(aadCtx);
  const { ciphertext, nonce } = await encryptAesGcmWithKey(subkey, plaintext, aad);
  return {
    encryptedPayload: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
  };
}

/**
 * Decrypts and parses a JSON vault payload using the HKDF `items` subkey + AAD.
 */
export async function decryptPayload<T>(
  vek: Uint8Array,
  encryptedPayloadB64: string,
  nonceB64: string,
  aadCtx: ItemAadContext,
): Promise<T> {
  const subkey = await deriveSubkeyHkdf(vek, 'items');
  const ciphertext = base64ToBytes(encryptedPayloadB64);
  const nonce = base64ToBytes(nonceB64);
  const aad = buildItemAad(aadCtx);
  const plaintext = await decryptAesGcmWithKey(subkey, ciphertext, nonce, aad);
  return JSON.parse(bytesToUtf8(plaintext)) as T;
}

/**
 * Wraps a 256-bit VEK using a 256-bit Key Encryption Key (KEK) via AES-256-GCM + envelope AAD.
 */
export async function wrapVek(
  kekBytes: Uint8Array,
  vekBytes: Uint8Array,
  aadCtx: EnvelopeAadContext,
): Promise<{ wrappedVek: string; nonce: string }> {
  if (kekBytes.length !== 32) {
    throw new Error('KEK must be 32 bytes');
  }
  if (vekBytes.length !== 32) {
    throw new Error('VEK must be 32 bytes');
  }
  const subtle = getSubtle();
  const kek = await subtle.importKey(
    'raw',
    toArrayBuffer(kekBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const aad = buildEnvelopeAad(aadCtx);
  const { ciphertext, nonce } = await encryptAesGcmWithKey(kek, vekBytes, aad);
  return {
    wrappedVek: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
  };
}

/**
 * Unwraps a wrapped VEK using a 256-bit KEK. Throws if authentication tag verification fails.
 */
export async function unwrapVek(
  kekBytes: Uint8Array,
  wrappedVekB64: string,
  nonceB64: string,
  aadCtx: EnvelopeAadContext,
): Promise<Uint8Array> {
  if (kekBytes.length !== 32) {
    throw new Error('KEK must be 32 bytes');
  }
  const subtle = getSubtle();
  const kek = await subtle.importKey(
    'raw',
    toArrayBuffer(kekBytes),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  const ciphertext = base64ToBytes(wrappedVekB64);
  const nonce = base64ToBytes(nonceB64);
  const aad = buildEnvelopeAad(aadCtx);
  const vek = await decryptAesGcmWithKey(kek, ciphertext, nonce, aad);
  if (vek.length !== 32) {
    throw new Error('Unwrapped VEK has invalid length');
  }
  return vek;
}

/**
 * Encrypts an export backup bundle using the dedicated `export` HKDF subkey or backup passphrase KEK.
 */
export async function encryptBackupBundle(
  keyBytes: Uint8Array,
  bundleObject: unknown,
  useHkdfExportSubkey = true,
): Promise<{ ciphertext: string; nonce: string }> {
  const subtle = getSubtle();
  const key = useHkdfExportSubkey
    ? await deriveSubkeyHkdf(keyBytes, 'export')
    : await subtle.importKey('raw', toArrayBuffer(keyBytes), { name: 'AES-GCM' }, false, ['encrypt']);
  const aad = utf8ToBytes('keynest:backup:v1');
  const plaintext = utf8ToBytes(JSON.stringify(bundleObject));
  const { ciphertext, nonce } = await encryptAesGcmWithKey(key, plaintext, aad);
  return {
    ciphertext: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
  };
}

export async function decryptBackupBundle<T>(
  keyBytes: Uint8Array,
  ciphertextB64: string,
  nonceB64: string,
  useHkdfExportSubkey = true,
): Promise<T> {
  const subtle = getSubtle();
  const key = useHkdfExportSubkey
    ? await deriveSubkeyHkdf(keyBytes, 'export')
    : await subtle.importKey('raw', toArrayBuffer(keyBytes), { name: 'AES-GCM' }, false, ['decrypt']);
  const aad = utf8ToBytes('keynest:backup:v1');
  const plaintext = await decryptAesGcmWithKey(
    key,
    base64ToBytes(ciphertextB64),
    base64ToBytes(nonceB64),
    aad,
  );
  return JSON.parse(bytesToUtf8(plaintext)) as T;
}

export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const subtle = getSubtle();
  const bytes = typeof input === 'string' ? utf8ToBytes(input) : input;
  const digest = await subtle.digest('SHA-256', toArrayBuffer(bytes));
  return bytesToHex(new Uint8Array(digest));
}

