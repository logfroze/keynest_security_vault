import {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64,
  bytesToBase64Url,
  utf8ToBytes,
} from '../cryptography/encoding';
import {
  generateRandomBytes,
  unwrapVek,
  wrapVek,
} from '../cryptography/cryptoEngine';
import type { VaultKeyEnvelope } from '@/types/vault';

const PRF_HKDF_SALT = utf8ToBytes('keynest-webauthn-prf-salt-v1');
const PRF_HKDF_INFO = utf8ToBytes('keynest-passkey-kek-v1');

interface PrfExtensionResult {
  prf?: {
    enabled?: boolean;
    results?: {
      first?: ArrayBuffer;
    };
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function'
  );
}

/**
 * Derives a 256-bit wrapping KEK from raw WebAuthn PRF output using HKDF-SHA-256.
 */
async function deriveKekFromPrfSecret(prfOutput: ArrayBuffer): Promise<Uint8Array> {
  const subtle = window.crypto.subtle;
  const baseKey = await subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(PRF_HKDF_SALT),
      info: toArrayBuffer(PRF_HKDF_INFO),
    },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

export interface PasskeyRegistrationResult {
  credentialId: string;
  transports: string[];
  envelope: Omit<VaultKeyEnvelope, 'id' | 'createdAt' | 'updatedAt'>;
}

/**
 * Registers a WebAuthn passkey and evaluates the PRF extension to wrap the VEK.
 * Fails gracefully with a descriptive error if the browser or authenticator lacks PRF support.
 */
export async function registerPasskeyWithPrf(params: {
  userId: string;
  email: string;
  vaultId: string;
  label: string;
  vek: Uint8Array;
  keyVersion?: number;
}): Promise<PasskeyRegistrationResult> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn passkeys are not supported in this browser.');
  }

  const keyVersion = params.keyVersion ?? 1;
  const challenge = generateRandomBytes(32);
  const prfSalt = generateRandomBytes(32);
  const userHandle = utf8ToBytes(params.userId).slice(0, 64);

  const createOptions: PublicKeyCredentialCreationOptions = {
    challenge: toArrayBuffer(challenge),
    rp: {
      name: 'KeyNest Vault',
      id: window.location.hostname,
    },
    user: {
      id: toArrayBuffer(userHandle),
      name: params.email,
      displayName: params.email,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256
      { type: 'public-key', alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
    timeout: 60000,
    extensions: {
      prf: {
        eval: {
          first: toArrayBuffer(prfSalt),
        },
      },
    } as AuthenticationExtensionsClientInputs,
  };

  const credential = (await navigator.credentials.create({
    publicKey: createOptions,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Passkey registration was cancelled.');
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  const transports =
    typeof response.getTransports === 'function' ? response.getTransports() : [];
  const extResults = credential.getClientExtensionResults() as PrfExtensionResult;

  let prfFirst = extResults.prf?.results?.first;

  // Many browsers enable PRF during `create` and return the evaluation output on `get`
  if (!prfFirst) {
    if (extResults.prf?.enabled === false) {
      throw new Error(
        'Your authenticator/browser created the passkey, but does not support the WebAuthn PRF extension required for zero-knowledge key wrapping. Use your Master Password on this device.',
      );
    }

    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: toArrayBuffer(generateRandomBytes(32)),
        rpId: window.location.hostname,
        allowCredentials: [
          {
            type: 'public-key',
            id: credential.rawId,
          },
        ],
        userVerification: 'required',
        timeout: 60000,
        extensions: {
          prf: {
            eval: {
              first: toArrayBuffer(prfSalt),
            },
          },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error('Passkey PRF verification was cancelled.');
    }

    const assertionExt = assertion.getClientExtensionResults() as PrfExtensionResult;
    prfFirst = assertionExt.prf?.results?.first;
  }

  if (!prfFirst) {
    throw new Error(
      'WebAuthn PRF output was not returned by this authenticator. Master password unlock remains available.',
    );
  }

  const kek = await deriveKekFromPrfSecret(prfFirst);
  const { wrappedVek, nonce } = await wrapVek(kek, params.vek, {
    userId: params.userId,
    vaultId: params.vaultId,
    method: 'passkey',
    keyVersion,
  });
  kek.fill(0);

  const credentialId = bytesToBase64Url(new Uint8Array(credential.rawId));
  const prfSaltB64 = bytesToBase64(prfSalt);

  return {
    credentialId,
    transports,
    envelope: {
      userId: params.userId,
      vaultId: params.vaultId,
      method: 'passkey',
      credentialId,
      salt: prfSaltB64,
      kdfParams: {
        algorithm: 'webauthn-prf',
        prfSalt: prfSaltB64,
      },
      wrappedVek,
      nonce,
      keyVersion,
    },
  };
}

/**
 * Unlocks the VEK using a previously registered passkey with WebAuthn PRF support.
 */
export async function unlockWithPasskeyPrf(
  envelopes: VaultKeyEnvelope[],
): Promise<{ vek: Uint8Array; credentialId: string }> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn passkeys are not supported in this browser.');
  }

  const passkeyEnvelopes = envelopes.filter(
    (env) => env.method === 'passkey' && Boolean(env.credentialId),
  );
  if (passkeyEnvelopes.length === 0) {
    throw new Error('No passkey unlock envelopes are registered for this vault.');
  }

  const primaryEnvelope = passkeyEnvelopes[0];
  const prfSaltB64 = primaryEnvelope.kdfParams.prfSalt ?? primaryEnvelope.salt;
  const prfSalt = base64ToBytes(prfSaltB64);

  // Build per-credential eval map when multiple passkeys exist
  const evalByCredential: Record<string, { first: ArrayBuffer }> = {};
  for (const env of passkeyEnvelopes) {
    if (env.credentialId) {
      const saltBytes = base64ToBytes(env.kdfParams.prfSalt ?? env.salt);
      evalByCredential[env.credentialId] = { first: toArrayBuffer(saltBytes) };
    }
  }

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: toArrayBuffer(generateRandomBytes(32)),
      rpId: window.location.hostname,
      allowCredentials: passkeyEnvelopes.map((env) => ({
        type: 'public-key',
        id: toArrayBuffer(base64UrlToBytes(env.credentialId!)),
      })),
      userVerification: 'required',
      timeout: 60000,
      extensions: {
        prf: {
          eval: { first: toArrayBuffer(prfSalt) },
          evalByCredential,
        },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error('Passkey unlock was cancelled.');
  }

  const usedCredId = bytesToBase64Url(new Uint8Array(assertion.rawId));
  const matchedEnvelope =
    passkeyEnvelopes.find((env) => env.credentialId === usedCredId) ?? primaryEnvelope;

  const extResults = assertion.getClientExtensionResults() as PrfExtensionResult;
  const prfFirst = extResults.prf?.results?.first;

  if (!prfFirst) {
    throw new Error(
      'This device did not return a WebAuthn PRF secret. Please unlock using your Master Password.',
    );
  }

  const kek = await deriveKekFromPrfSecret(prfFirst);
  try {
    const vek = await unwrapVek(kek, matchedEnvelope.wrappedVek, matchedEnvelope.nonce, {
      userId: matchedEnvelope.userId,
      vaultId: matchedEnvelope.vaultId,
      method: 'passkey',
      keyVersion: matchedEnvelope.keyVersion,
    });
    return { vek, credentialId: usedCredId };
  } finally {
    kek.fill(0);
  }
}

