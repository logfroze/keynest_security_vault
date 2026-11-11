import { argon2id } from 'hash-wasm';
import type { KdfParams } from '@/types/vault';

export type KdfProfile = 'standard' | 'interactive';

export const DEFAULT_KDF_PARAMS: Record<KdfProfile, Required<Pick<KdfParams, 'algorithm' | 'memorySize' | 'iterations' | 'parallelism' | 'hashLength'>>> = {
  // OWASP-aligned interactive Argon2id defaults (64 MiB, t=3, p=1)
  standard: {
    algorithm: 'argon2id',
    memorySize: 65536,
    iterations: 3,
    parallelism: 1,
    hashLength: 32,
  },
  // Lighter profile for automated test vectors or constrained devices
  interactive: {
    algorithm: 'argon2id',
    memorySize: 16384,
    iterations: 2,
    parallelism: 1,
    hashLength: 32,
  },
};

export function getDefaultKdfParams(profile?: KdfProfile): KdfParams {
  const envProfile =
    typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_KDF_PROFILE === 'interactive'
      ? 'interactive'
      : 'standard';
  const selected = profile ?? envProfile;
  return { ...DEFAULT_KDF_PARAMS[selected] };
}

/**
 * Derives a 256-bit Key Encryption Key (KEK) from a secret (master password or recovery key)
 * and a 16-byte random salt using Argon2id compiled to WebAssembly.
 */
export async function deriveKeyArgon2id(
  secret: string,
  salt: Uint8Array,
  params?: Partial<KdfParams>,
): Promise<Uint8Array> {
  if (!secret || secret.length === 0) {
    throw new Error('Secret cannot be empty for key derivation');
  }
  if (salt.length < 16) {
    throw new Error('Salt must be at least 16 bytes');
  }

  const defaults = DEFAULT_KDF_PARAMS.standard;
  const memorySize = params?.memorySize ?? defaults.memorySize;
  const iterations = params?.iterations ?? defaults.iterations;
  const parallelism = params?.parallelism ?? defaults.parallelism;
  const hashLength = params?.hashLength ?? defaults.hashLength;

  return argon2id({
    password: secret,
    salt,
    parallelism,
    iterations,
    memorySize,
    hashLength,
    outputType: 'binary',
  });
}

