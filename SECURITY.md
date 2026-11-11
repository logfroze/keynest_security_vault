# KeyNest Cryptographic & Security Specification (v1.0)

## 1. Zero-Knowledge Threat Model
KeyNest separates **Account Authentication** from **Vault Decryption**:
- The backend (Supabase Auth + PostgreSQL) authenticates user identity and enforces Row Level Security (`auth.uid() = user_id`).
- Neither the backend, PostgreSQL database, local `IndexedDB` cache, nor server logs ever receive plaintext secrets, the Master Password, the Recovery Key, or the Vault Encryption Key (VEK).
- Every item title, category, field value, tag, custom field, password history entry, and note is serialized as JSON and encrypted client-side before leaving memory.

## 2. Cryptographic Primitives & Key Hierarchy

| Component | Primitive / Standard | Parameters |
|---|---|---|
| Master Password KDF | **Argon2id** (`hash-wasm`) | Memory: `65536 KiB` (64 MiB), Iterations: `3`, Parallelism: `1`, Output: `256-bit (32 bytes)` |
| Random Vault Encryption Key (VEK) | CSPRNG (`crypto.getRandomValues`) | `256-bit (32 bytes)` random key generated once per vault |
| Key Separation | **HKDF-SHA-256** (Web Crypto API) | Info strings: `keynest-vault-items-v1`, `keynest-export-v1`, `keynest-meta-v1` |
| Symmetric AEAD | **AES-256-GCM** (Web Crypto API) | `96-bit (12-byte)` unique random nonce per operation, `128-bit` auth tag |
| Key Wrapping | **AES-256-GCM** | Wraps raw 256-bit VEK with KEK derived from Master Password, Recovery Key, or WebAuthn PRF |
| Passkey Key Derivation | **WebAuthn PRF Extension** | `HMAC-SHA256` / `HKDF` over PRF output with domain salt -> 256-bit wrapping KEK |

## 3. Authenticated Encryption with Associated Data (AAD)
Every `vault_items` encryption operation binds ciphertext to its structural context via GCM `additionalData`:
```
AAD = UTF8("keynest:v1:{user_id}:{vault_id}:{item_id}:{encryption_version}")
```
Every `vault_key_envelopes` wrapping operation binds the wrapped VEK to:
```
EnvelopeAAD = UTF8("keynest:envelope:v1:{user_id}:{vault_id}:{method}:{key_version}")
```
Tampering with `user_id`, `vault_id`, `item_id`, `method`, or `encryption_version` invalidates the GCM tag and fails decryption immediately.

## 4. Nonce Uniqueness
- Every call to `encryptPayload` and `wrapVek` generates a fresh 12-byte (96-bit) nonce from `crypto.getRandomValues(new Uint8Array(12))`.
- Nonces are never reused or sequentially counter-guessed across devices.

## 5. Key Rotation & Recovery
- **Changing the Master Password** derives a new KEK from the new password and re-wraps the existing VEK (`master` envelope). Existing `vault_items` do **not** require re-encryption.
- **Recovery Key**: During setup, a 256-bit random key formatted as grouped Base32 (`KNST-...`) is generated client-side, hashed with Argon2id using a unique salt, and used to wrap the VEK into a `recovery` envelope. Only a non-reversible truncated SHA-256 fingerprint hint is stored for UI confirmation.

## 6. Memory, Storage & Clipboard Controls
- Decrypted VEK and item payloads live **strictly in memory** while the vault is unlocked.
- `localStorage` and `sessionStorage` are never used for keys, master passwords, or vault items.
- `IndexedDB` stores **encrypted envelopes and encrypted payloads only** for offline availability.
- Auto-lock clears the in-memory VEK and decrypted state after inactivity or on manual lock.
- Clipboard auto-clear overwrites the clipboard after a configurable timeout (default 30 seconds) when copying secrets.
- Financial and Payment Card secrets require explicit reveal/copy confirmation.

## 7. AI Privacy Boundary
- **Local Zero-Knowledge AI (Default)**: Text parsing, classification, duplicate detection, and natural-language vault search run entirely inside the browser on already-unlocked in-memory data.
- **Optional Cloud AI (Disabled by default)**: Requires explicit user opt-in and explicit per-request approval. Never transmits the full decrypted vault automatically.
- AI operations draft changes for **explicit human review and approval** before encrypting and saving to the vault.

