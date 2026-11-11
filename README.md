# KeyNest — Zero-Knowledge Personal Security Vault

KeyNest is a lightweight, privacy-first personal vault built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **Web Crypto API + Argon2id (WASM)**, and **Supabase** (with an automatic zero-knowledge local IndexedDB mode for instant offline/localhost usage).

## Core Security Architecture

- **Zero-Knowledge Encryption**: Account login and vault decryption are separate layers. Every vault item (`title`, `category`, `fields`, `tags`, `notes`, `customFields`, `passwordHistory`) is encrypted client-side with **AES-256-GCM** and **Additional Authenticated Data (AAD)** before touching IndexedDB or PostgreSQL.
- **Key Hierarchy**:
  - Random **256-bit Vault Encryption Key (VEK)** generated locally on setup.
  - **Argon2id** (`hash-wasm`) derives a Key Encryption Key (KEK) from your Master Password or Recovery Key to wrap the VEK.
  - **HKDF-SHA-256** derives isolated purpose subkeys (`items`, `export`, `meta`).
  - **WebAuthn PRF** passkey envelope wrapping on supported authenticators/browsers.
- **Local-First Vault AI**: Bulk text import parsing, category classification, duplicate detection, and natural-language search run inside browser memory without sending secrets to any external server. Optional Cloud AI requires explicit user opt-in and sends only a redacted index.

See [SECURITY.md](./SECURITY.md) for the complete cryptographic specification.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Connecting Supabase (Multi-Device Cloud Sync)

1. Create a Supabase project (e.g., under `logfroze@gmail.com`).
2. Run the SQL migration in `supabase/migrations/001_initial_schema.sql` via the Supabase SQL Editor.
3. Copy `.env.example` to `.env.local` and fill in:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
4. Restart the Next.js server. KeyNest automatically switches from **Local Encrypted Mode** to **Supabase Cloud Sync + Realtime**.

## Testing & Verification

```bash
npm test          # Run Vitest unit & cryptographic tests
npm run typecheck # Run TypeScript strict type-checking
npm run build     # Verify production Next.js build
```

