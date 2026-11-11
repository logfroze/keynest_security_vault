KeyNest — Technical Architecture & Development Specification
Architecture established
Version 1.0
Privacy-first

We're officially going with KeyNest. 🔐

I want to approach this as a real software product rather than a quick CRUD application. It should be small in functionality, but strong in architecture, security, reliability, and maintainability.

Our core philosophy:
Your secrets belong to you. KeyNest should store them, organize them, and make them accessible without ever needing to know what they contain.

The application will have three fundamental layers:

1. Identity and authentication — knowing who you are.
2. Vault encryption and synchronization — protecting your information.
3. AI assistance — helping you organize and retrieve information without compromising privacy.

4. Product definition

cybernews.com

KeyNest
Your private digital vault.
Zero-knowledge architecture
AI-assisted
Multi-device

A lightweight, personal information vault for storing, organizing, synchronizing, and retrieving sensitive information.

Property Decision
Product KeyNest
Type Personal encrypted vault
Initial platform Web application / PWA
Frontend Next.js + React + TypeScript
Backend Supabase
Database PostgreSQL
Encryption Client-side AES-256-GCM
Key derivation Argon2id
Authentication Email + password / passkeys
Vault unlocking Master password / passkey
AI Hybrid local + optional cloud
Deployment Vercel + Supabase

Target: A single-user-first application that can later support multiple independent user accounts without redesigning its security foundation. 2. Authentication and vault unlocking
This is our first major architectural decision.

Account authentication and vault encryption must be separate systems.

A user can authenticate successfully but still be unable to read their vault without the correct encryption key.
2.1 Two ways to unlock

Method A — Master password
Primary unlock method

- User enters their master password.
- Argon2id derives a key-encryption key.
- The key decrypts the user's wrapped vault encryption key.
- The vault becomes accessible.

  Method B — Passkey
  Alternative unlock method

- User authenticates with a registered passkey.
- WebAuthn verifies the credential.
- Where supported, the WebAuthn PRF extension derives an encryption secret.
- That secret unwraps the vault key.
- The vault becomes accessible.

Important technical detail: A normal passkey authentication assertion is not itself an encryption key. We must implement WebAuthn PRF-based key derivation, check browser/device compatibility, and provide a secure fallback.

For devices that cannot support this method, the master password remains available.
2.2 Recovery mechanism
We should generate a random recovery key during initial setup.

The user receives it once and is asked to save it securely.

The recovery key can independently unlock the wrapped vault key through a separate recovery envelope.

This protects against losing both the master password and access to a registered passkey.

It must never be sent to our backend in plaintext.
2.3 Key hierarchy
Here's the proposed cryptographic structure:
Random Vault Encryption Key (VEK)

Random 256-bit key

Master password

Argon2id-derived KEK
Wrap VEK

Passkey

WebAuthn PRF secret
Wrap VEK

Encrypted vault records

Encrypted and authenticated using VEK-derived encryption keys

The same random VEK is wrapped separately for each authorized unlock method. Changing the master password should only require rewrapping the VEK, not decrypting and re-encrypting every record.

For additional isolation, we can derive separate encryption keys for vault data and other purposes using HKDF.

3. Application architecture
   We'll use a modular monolith rather than microservices.

That means one application, one backend platform, and clearly separated internal modules.

This keeps development quick without sacrificing maintainability.
KeyNest architecture
Client applications

Desktop browser · Mobile browser · Installed PWA

Next.js + TypeScript
Dashboard

Vault UI

Crypto Engine

AI Assistant

Search Engine

Sync Engine

Supabase backend

Authentication · PostgreSQL · Row Level Security · Realtime

PostgreSQL

Encrypted records

Object storage

Future encrypted files

3.1 Frontend modules
Module Responsibility
Authentication Registration, login, sessions
Vault Manager CRUD and categories
Crypto Engine Encryption and decryption
Key Manager Key derivation, wrapping and recovery
Search Engine Local decrypted-data search
AI Assistant Import, classification and queries
Sync Engine Cross-device synchronization
Security Manager Auto-lock, clipboard and session controls
Settings Passkeys, recovery and preferences

Each module should have a defined interface. The UI should never directly implement encryption logic.
3.2 Recommended frontend libraries

- Next.js App Router
- TypeScript (strict mode)
- Tailwind CSS
- shadcn/ui for selected components
- Zod for validation
- React Hook Form for complex forms
- Web Crypto API for encryption
- A maintained Argon2id implementation compiled to WebAssembly
- IndexedDB for encrypted offline data
- TanStack Query for server-state management
  We should use a mature cryptographic implementation rather than writing our own encryption algorithms.

4. Database specification
   The backend will use PostgreSQL through Supabase.

The database should never contain readable passwords, API keys, financial information, or personal secrets.
4.1 Database tables
Table Purpose
profiles Basic account preferences
vaults Vault metadata and encryption version
vault_key_envelopes Wrapped VEK for each unlock method
vault_items Encrypted vault records
passkey_credentials WebAuthn credential metadata
recovery_config Recovery envelope metadata
device_sessions Device and session information
security_events Security-related activity metadata

4.2 Main vault record
A proposed vault_items structure:
CREATE TABLE vault_items (
id UUID PRIMARY KEY,
user_id UUID NOT NULL,
vault_id UUID NOT NULL,

    encrypted_payload BYTEA NOT NULL,
    nonce BYTEA NOT NULL,

    encryption_version INTEGER NOT NULL DEFAULT 1,
    revision INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ

);

The encrypted payload contains the entire item:
{
"title": "GitHub",
"category": "developer_secret",
"fields": {
"username": "example",
"email": "example@email.com",
"token": "secret-token"
},
"tags": ["development", "work"],
"notes": "Personal GitHub account"
}

This JSON is encrypted on the client before reaching PostgreSQL.

Even the title, category, tags and notes should be encrypted.

Only the minimum synchronization metadata should remain visible to the backend.
4.3 Database security rules

- Every record belongs to an authenticated user.
- Supabase Row Level Security is enabled on every user-owned table.
- Users can only access their own records.
- Database policies must enforce ownership on SELECT, INSERT, UPDATE and DELETE.
- No Supabase service-role credentials in the frontend.
- No secrets in server logs.
- No plaintext secrets in analytics or error tracking.
- Rate limits on authentication and security-sensitive operations.
  We should also use a dedicated backend function for sensitive operations where required, but never give it access to the plaintext vault.

5. Vault data models
   This is important because we want proper formats rather than a collection of generic text boxes.

The frontend will have typed schemas for every category.
5.1 Proposed categories
Category Main fields
Login Website, username, email, password, 2FA, URL
Developer Service, API key, secret, endpoint, environment
Financial Bank, account title, IBAN, account number, wallet
Personal Full name, email, phone, address, custom fields
Payment Cardholder, card number, expiry, billing details
Secure Note Title, content, tags, custom fields

We should also support:

- Custom categories.
- Custom field labels.
- Text, password, email, URL, date and number field types.
- Favorite items.
- Tags.
- Duplicate detection.
- Optional item icons.
  Important: Sensitive financial data should have additional confirmation before revealing or copying it. For the first release, storing full payment card data should be optional and disabled until we have reviewed the relevant payment-data security requirements.

6. AI architecture — Hybrid AI
   This is one of the most interesting components of KeyNest.

I want to divide the AI system into two separate operating modes.
Local AI / Local Processing

Default

Information remains on the user's device.

- Import text files.
- Detect account information.
- Identify categories.
- Extract fields.
- Find duplicates.
- Search decrypted records.
- Generate structured JSON.

Cloud AI

Optional

Explicitly approved external AI requests.

- More complex natural-language understanding.
- Ambiguous import classification.
- Advanced organization.
- Assistance with complicated text.
- Complex queries on user-selected information.

  6.1 How importing works
  Let's say you have a text file containing 50 different accounts.

The workflow:
#chatgpt-mermaid-_r_l9_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(237, 237, 237);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-_r_l9_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_l9_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_l9_ .error-icon{fill:rgb(48, 48, 48);}#chatgpt-mermaid-_r_l9_ .error-text{fill:rgb(237, 237, 237);stroke:rgb(237, 237, 237);}#chatgpt-mermaid-_r_l9_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-_r_l9_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-_r_l9_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-_r_l9_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-_r_l9_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-_r_l9_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-_r_l9_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_l9_ .marker.cross{stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_l9_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-_r_l9_ p{margin:0;}#chatgpt-mermaid-_r_l9_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_l9_ .cluster-label text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-_r_l9_ .cluster-label span{color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_l9_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-_r_l9_ .label text,#chatgpt-mermaid-_r_l9_ span{fill:rgb(237, 237, 237);color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_l9_ .node rect,#chatgpt-mermaid-_r_l9_ .node circle,#chatgpt-mermaid-_r_l9_ .node ellipse,#chatgpt-mermaid-_r_l9_ .node polygon,#chatgpt-mermaid-_r_l9_ .node path{fill:rgb(17, 40, 19);stroke:rgb(58, 132, 63);stroke-width:1px;}#chatgpt-mermaid-_r_l9_ .rough-node .label text,#chatgpt-mermaid-_r_l9_ .node .label text,#chatgpt-mermaid-_r_l9_ .image-shape .label,#chatgpt-mermaid-_r_l9_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-_r_l9_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-_r_l9_ .rough-node .label,#chatgpt-mermaid-_r_l9_ .node .label,#chatgpt-mermaid-_r_l9_ .image-shape .label,#chatgpt-mermaid-_r_l9_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-_r_l9_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-_r_l9_ .root .anchor path{fill:rgb(175, 175, 175)!important;stroke-width:0;stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_l9_ .arrowheadPath{fill:rgb(175, 175, 175);}#chatgpt-mermaid-_r_l9_ .edgePath .path{stroke:rgb(175, 175, 175);stroke-width:1px;}#chatgpt-mermaid-_r_l9_ .flowchart-link{stroke:rgb(175, 175, 175);fill:none;}#chatgpt-mermaid-_r_l9_ .edgeLabel{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-_r_l9_ .edgeLabel p{background-color:rgb(0, 0, 0);}#chatgpt-mermaid-_r_l9_ .edgeLabel rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-_r_l9_ .labelBkg{background-color:rgba(0, 0, 0, 0.5);}#chatgpt-mermaid-_r_l9_ .cluster rect{fill:rgb(48, 48, 48);stroke:rgba(255, 255, 255, 0.15);stroke-width:1px;}#chatgpt-mermaid-_r_l9_ .cluster text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-_r_l9_ .cluster span{color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_l9_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(48, 48, 48);border:1px solid rgba(255, 255, 255, 0.15);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-_r_l9_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(237, 237, 237);}#chatgpt-mermaid-_r_l9_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-_r_l9_ .icon-shape,#chatgpt-mermaid-_r_l9_ .image-shape{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-_r_l9_ .icon-shape p,#chatgpt-mermaid-_r_l9_ .image-shape p{background-color:rgb(0, 0, 0);padding:2px;}#chatgpt-mermaid-_r_l9_ .icon-shape .label rect,#chatgpt-mermaid-_r_l9_ .image-shape .label rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-_r_l9_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-_r_l9_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-_r_l9_ .node .neo-node{stroke:rgb(58, 132, 63);}#chatgpt-mermaid-_r_l9_ [data-look="neo"].node rect,#chatgpt-mermaid-_r_l9_ [data-look="neo"].cluster rect,#chatgpt-mermaid-_r_l9_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-_r_l9_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_l9_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-_r_l9_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-_r_l9_-gradient);stroke-width:1px;}#chatgpt-mermaid-_r_l9_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_l9_ [data-look="neo"].node .neo-line path{stroke:rgb(58, 132, 63);filter:none;}#chatgpt-mermaid-_r_l9_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-_r_l9_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_l9_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-_r_l9_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-_r_l9_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_l9_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-_r_l9_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_l9_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(140, 223, 173);}#chatgpt-mermaid-_r_l9_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(140, 223, 173);}#chatgpt-mermaid-_r_l9_ .node tspan[font-weight="normal"],#chatgpt-mermaid-_r_l9_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-_r_l9_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(2, 28, 12);stroke:rgb(26, 75, 45);stroke-width:1px;}#chatgpt-mermaid-_r_l9_ .node rect,#chatgpt-mermaid-_r_l9_ .node circle,#chatgpt-mermaid-_r_l9_ .node ellipse,#chatgpt-mermaid-_r_l9_ .node polygon,#chatgpt-mermaid-_r_l9_ .node path{fill:rgb(0, 55, 22);stroke:rgba(255, 255, 255, 0.1);stroke-width:1px;}#chatgpt-mermaid-_r_l9_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-_r_l9_ .mermaid-decision .label-container{fill:rgb(2, 28, 12);stroke:rgb(26, 75, 45);stroke-dasharray:2,2;}#chatgpt-mermaid-_r_l9_ .edgePaths .flowchart-link{stroke:rgb(175, 175, 175);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-_r_l9_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_l9_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Select text fileRead locallyLocal parser / AIExtract individual recordsIdentify categoriesValidate field formatsDetect duplicatesDisplay import previewUser approval?Edit or cancelEncrypt records locallySave encrypted recordsNoYes

The assistant must never silently overwrite existing records.

For example:

- 40 new records → ready for import.
- 5 duplicates → flagged.
- 3 incomplete records → flagged for review.
- 2 ambiguous records → require manual classification.
  6.2 AI tools and permissions
  We should give the assistant a small set of controlled operations:
  Tool Permission
  Search records Read
  Read selected record Read with authorization
  Prepare new record Draft
  Prepare update Draft
  Save new record User approval
  Update record User approval
  Delete record Explicit confirmation

The AI should not receive unrestricted database access.

Cloud AI must never automatically receive the entire decrypted vault.

For local processing, we can initially use deterministic parsers, regex, structured extraction and a local model where available. This is a much more practical MVP than trying to run a large language model on every device.

7. Cross-device synchronization
   This is another core feature.

You should be able to add a record on your laptop and find it on your phone within seconds.
7.1 Synchronization workflow

1. User creates a record.
2. Client encrypts the record.
3. Encrypted data is uploaded to Supabase.
4. Supabase notifies other authorized devices.
5. Other devices download the encrypted update.
6. Their local vault decrypts it after unlocking.
   Laptop
   Unlocked

Phone
Unlocked

Encrypted synchronization

Supabase Realtime + PostgreSQL

Encrypted cloud storage

No readable vault content

7.2 Conflict handling
Suppose you update your GitHub token on your laptop while simultaneously editing the same record on your phone.

We need a conflict resolution system.

For MVP:

- Every record has a revision number.
- Updates use optimistic concurrency control.
- The server rejects stale revisions.
- The application detects conflicts.
- The user can choose which version to retain.
  Never silently overwrite one device's newer information with an older copy.
  7.3 Offline mode
  We can support basic offline access.

However:

- Store only encrypted vault data in IndexedDB.
- Keep decrypted information in memory.
- Never cache decrypted vault pages through service workers.
- Clear sensitive application state when locking.
- Require unlocking again after application restart.
- Queue encrypted changes for synchronization when connectivity returns.
  Offline access is useful, but it increases the security surface, so it must be tested carefully.

8. Application UI and navigation
   I recommend a minimal interface with no unnecessary screens.

KeyNest

YOUR PERSONAL VAULT
Welcome back.
Your information, securely organized.
Vault unlocked
Encrypted synchronization active

12
Logins

08
Developer

04
Financial

06
Secure notes

Ask KeyNest AI

Find my hosting credentials...

Home

Vault

AI

Settings

Conceptual interface preview — illustrative data, not an actual connected application.

Navigation structure
Page Functionality
Home Overview, recent items, quick actions
Vault Categories, records and filters
AI Assistant Chat and bulk import
Settings Security, devices, account and preferences

Important interface features
Global search

Search by website, username, email, category, tags and custom fields.

Search happens locally after unlocking.

Quick access

- Copy username.
- Copy password.
- Reveal secret.
- Edit record.
- Favorite record.
  Security controls
- Lock vault immediately.
- Auto-lock after inactivity.
- Clear clipboard after a configurable interval.
- View registered devices.
- Revoke device sessions.
- Review security events.
  I would use a clean charcoal/white interface with a restrained teal accent. No unnecessary glass effects, floating panels or excessive gradients.

9. Security threat model
   We need to be realistic: encryption alone does not make an application secure.

Here are the threats KeyNest must address.
Threat Protection
Database breach Client-side encryption
Stolen database backups Encrypted records and key envelopes
Unauthorized account login MFA, passkeys, rate limits
Stolen unlocked device Auto-lock, device security
Malicious browser scripts CSP, XSS protection, dependency controls
AI provider data exposure Local-first AI and explicit consent
Lost master password Recovery key
Compromised device Device security warnings and revocation
Malicious sync changes Authenticated encryption and revision checks
Malicious application update Dependency pinning, review and release controls

Additional security requirements
I consider these mandatory:

1. Use a maintained cryptographic library and documented encryption format.
2. Use authenticated encryption with associated data (AAD), binding ciphertext to its user, vault and record identifiers.
3. Never reuse an AES-GCM nonce with the same key.
4. Use separate key purposes through HKDF.
5. Protect against CSRF, XSS and clickjacking.
6. Never expose secrets in browser console logs or network error messages.
7. Use strict Content Security Policy.
8. Disable third-party analytics on unlocked vault pages.
9. Keep cryptographic keys out of localStorage, sessionStorage and IndexedDB.
10. Test recovery and key rotation before production.
    One more important point: A zero-knowledge backend cannot protect against a compromised device or malicious JavaScript served by the application itself. Production deployments must therefore protect the frontend delivery pipeline too.

11. Project structure
    I recommend organizing the project like this:
    keynest/
    │
    ├── public/
    │ ├── icons/
    │ └── manifest.json
    │
    ├── src/
    │ ├── app/
    │ │ ├── (auth)/
    │ │ │ ├── login/
    │ │ │ ├── register/
    │ │ │ └── recovery/
    │ │ │
    │ │ ├── (vault)/
    │ │ │ ├── home/
    │ │ │ ├── vault/
    │ │ │ ├── ai/
    │ │ │ └── settings/
    │ │ │
    │ │ └── api/
    │ │
    │ ├── components/
    │ │ ├── ui/
    │ │ ├── vault/
    │ │ ├── forms/
    │ │ ├── ai/
    │ │ └── security/
    │ │
    │ ├── modules/
    │ │ ├── authentication/
    │ │ ├── cryptography/
    │ │ ├── key-management/
    │ │ ├── vault/
    │ │ ├── synchronization/
    │ │ ├── search/
    │ │ ├── ai/
    │ │ └── security/
    │ │
    │ ├── lib/
    │ │ ├── supabase/
    │ │ ├── validation/
    │ │ └── utilities/
    │ │
    │ ├── hooks/
    │ ├── types/
    │ └── styles/
    │
    ├── supabase/
    │ ├── migrations/
    │ ├── functions/
    │ └── seed.sql
    │
    ├── tests/
    │ ├── unit/
    │ ├── integration/
    │ ├── security/
    │ └── e2e/
    │
    ├── .env.example
    ├── package.json
    └── README.md

We should keep cryptographic code independently testable, preferably in a dedicated module with a narrow public API.

11. Development roadmap
    I'd build this in six phases.
    KeyNest development plan
1. Phase 1 — Project foundation
   First priority
   - Initialize Next.js and TypeScript.
   - Configure Supabase.
   - Design PostgreSQL schema.
   - Implement registration and login.
   - Establish security configuration.
   - Implement the cryptographic key hierarchy.

     Deliverable: secure authentication and vault-unlock foundation.
1. Phase 2 — Encryption engine
   - Argon2id integration.
   - AES-256-GCM encryption/decryption.
   - Key wrapping and recovery.
   - Passkey registration and PRF support.
   - Encryption tests and test vectors.

     Deliverable: independently tested encryption engine.
1. Phase 3 — Vault application
   - Dashboard.
   - Categories and custom fields.
   - Add/edit/delete records.
   - Search and filters.
   - Password generator.
   - Clipboard protection.

     Deliverable: fully functional personal vault.
1. Phase 4 — Cloud synchronization
   - Encrypted database storage.
   - Cross-device synchronization.
   - Conflict detection.
   - Offline encrypted cache.
   - Device management.

     Deliverable: multi-device vault.
1. Phase 5 — AI assistant
   - Text and file import.
   - Local information extraction.
   - Automatic categorization.
   - Duplicate detection.
   - Natural-language search.
   - Optional cloud AI integration.

     Deliverable: AI-assisted vault management.
1. Phase 6 — Production readiness
   - Security audit.
   - Penetration testing.
   - Browser compatibility.
   - Recovery testing.
   - Backup and restore.
   - Deployment and monitoring.

     Deliverable: production-ready release candidate.

I would not put a fixed number of days on this yet. The encryption, recovery and passkey implementation need to pass their tests before we move forward. 12. Definition of done — Version 1.0
Before calling KeyNest ready, these acceptance tests must pass.
Test Expected result
Registration New user can create account
Authentication Unauthorized users cannot access vault
Wrong master password Vault remains locked
Encryption Database contains no readable secrets
Passkey unlock Works on supported devices
Recovery Recovery key restores vault access
Record management Create, edit, delete and retrieve
Synchronization Updates appear on other devices
Conflicts No silent overwrites
AI import Correctly structures imported records
AI privacy No secret sent to cloud without consent
Auto-lock Sensitive data becomes inaccessible
Export Backup can be decrypted and restored
Isolation User A cannot access User B's records

I would also require independent security review before trusting it with critical credentials. Passing our own tests is necessary, but not proof that the application is secure.

13. Final technology decisions
    KeyNest technical baseline
    Proposed architecture locked
    Component Selected technology
    Framework Next.js
    Language TypeScript
    Styling Tailwind CSS
    Components shadcn/ui
    Backend Supabase
    Database PostgreSQL
    Authentication Supabase Auth
    Passkeys WebAuthn
    Encryption Web Crypto API
    KDF Argon2id
    Key derivation HKDF
    Local storage IndexedDB (ciphertext only)
    Synchronization Supabase Realtime
    AI Local-first + optional cloud
    Deployment Vercel
    Testing Vitest + Playwright

14. What we should build first
    My recommendation is to resist the temptation to start with the beautiful dashboard.

Start with the cryptographic foundation.

A password manager with a beautiful interface and flawed encryption is worse than having no password manager at all.

Our first development milestone should be:

KeyNest Core Engine

1. User registration and authentication.
2. Master password setup.
3. Random vault key generation.
4. Argon2id key derivation.
5. AES-256-GCM encryption.
6. Vault key wrapping.
7. Passkey and recovery envelopes.
8. Encrypt/decrypt verification.
9. Encrypted database storage.
10. Cross-device unlock verification.
    Only after these work should we build the full dashboard.

My final recommendation
Keep KeyNest as a personal-first product. Don't turn it into another bloated password manager.

Its three strongest characteristics should be:

- Simplicity: Everything is quick to access.
- Security: Your information is encrypted before leaving your device.
- Intelligence: AI helps you manage information without getting unrestricted access to your secrets.
  One additional thing: keep a separate, documented cryptographic specification (SECURITY.md) from the beginning. This will make future audits, changes and maintenance much easier.

Next step: I can turn this specification into a complete, implementation-ready Software Design Document (SDD), including exact database migrations, TypeScript interfaces, encryption APIs, authentication flows, security tests and development tasks that you can feed into Antigravity IDE one phase at a time. 🚀
