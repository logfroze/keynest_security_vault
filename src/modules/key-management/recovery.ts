import { deriveKeyArgon2id, getDefaultKdfParams, type KdfProfile } from '../cryptography/argon2';
import { generateRandomBytes, sha256Hex } from '../cryptography/cryptoEngine';
import type { KdfParams } from '@/types/vault';

// Crockford-inspired unambiguous Base32 alphabet (no 0, 1, I, L, O)
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Generates a 256-bit recovery key formatted as grouped readable blocks (`KNST-XXXX-...`).
 */
export function generateRecoveryKey(): string {
  // 52 Base32 characters * 5 bits = 260 bits (> 256 bits of CSPRNG entropy)
  const charsNeeded = 52;
  const result: string[] = [];
  const alphabetLen = RECOVERY_ALPHABET.length; // 31
  const maxValid = Math.floor(256 / alphabetLen) * alphabetLen;

  while (result.length < charsNeeded) {
    const batch = generateRandomBytes(64);
    for (const byte of batch) {
      if (byte < maxValid && result.length < charsNeeded) {
        result.push(RECOVERY_ALPHABET[byte % alphabetLen]);
      }
    }
  }

  const groups: string[] = [];
  for (let i = 0; i < result.length; i += 4) {
    groups.push(result.slice(i, i + 4).join(''));
  }
  return `KNST-${groups.join('-')}`;
}

export function normalizeRecoveryKey(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.startsWith('KNST') ? cleaned.slice(4) : cleaned;
}

export function isValidRecoveryKeyFormat(input: string): boolean {
  const normalized = normalizeRecoveryKey(input);
  if (normalized.length < 40) return false;
  return Array.from(normalized).every((ch) => RECOVERY_ALPHABET.includes(ch));
}

/**
 * Non-reversible display fingerprint stored in `recovery_config` metadata.
 */
export async function computeRecoveryFingerprint(recoveryKey: string): Promise<string> {
  const normalized = normalizeRecoveryKey(recoveryKey);
  const hash = await sha256Hex(`keynest-recovery-fingerprint-v1:${normalized}`);
  return `${hash.slice(0, 4).toUpperCase()}-${hash.slice(4, 8).toUpperCase()}-${hash.slice(8, 12).toUpperCase()}`;
}

export async function deriveRecoveryKek(
  recoveryKey: string,
  salt: Uint8Array,
  params?: Partial<KdfParams>,
  profile?: KdfProfile,
): Promise<{ kek: Uint8Array; kdfParams: KdfParams }> {
  const normalized = normalizeRecoveryKey(recoveryKey);
  if (!normalized) {
    throw new Error('Recovery key cannot be empty');
  }
  const effectiveParams = params?.memorySize ? { ...getDefaultKdfParams(profile), ...params } : getDefaultKdfParams(profile);
  const kek = await deriveKeyArgon2id(normalized, salt, effectiveParams);
  return { kek, kdfParams: effectiveParams };
}

