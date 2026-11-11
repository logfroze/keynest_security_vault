-- KeyNest Zero-Knowledge Vault Database Schema (v1.0)
-- Every secret payload is encrypted client-side with AES-256-GCM before storage.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  preferences JSONB NOT NULL DEFAULT '{
    "autoLockMinutes": 5,
    "clipboardClearSeconds": 30,
    "confirmSensitiveReveal": true,
    "enablePaymentCategory": false,
    "cloudAiEnabled": false
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Vaults
CREATE TABLE IF NOT EXISTS public.vaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Personal Vault',
  encryption_version INTEGER NOT NULL DEFAULT 1,
  kdf_algorithm TEXT NOT NULL DEFAULT 'argon2id',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vaults_user_id ON public.vaults(user_id);

-- 3. Vault Key Envelopes (Master Password, Passkey PRF, Recovery Key)
CREATE TABLE IF NOT EXISTS public.vault_key_envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('master', 'passkey', 'recovery')),
  credential_id TEXT,
  salt TEXT NOT NULL,
  kdf_params JSONB NOT NULL,
  wrapped_vek TEXT NOT NULL,
  nonce TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_key_envelopes_vault ON public.vault_key_envelopes(vault_id, user_id);

-- 4. Encrypted Vault Items
CREATE TABLE IF NOT EXISTS public.vault_items (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  encrypted_payload BYTEA NOT NULL,
  nonce BYTEA NOT NULL,
  encryption_version INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vault_items_user_vault ON public.vault_items(user_id, vault_id);
CREATE INDEX IF NOT EXISTS idx_vault_items_updated ON public.vault_items(updated_at DESC);

-- 5. Passkey Credential Metadata (No secret key material stored)
CREATE TABLE IF NOT EXISTS public.passkey_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  prf_enabled BOOLEAN NOT NULL DEFAULT false,
  transports TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user ON public.passkey_credentials(user_id, vault_id);

-- 6. Recovery Configuration Metadata (Fingerprint hint only; key never stored)
CREATE TABLE IF NOT EXISTS public.recovery_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  key_fingerprint TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vault_id)
);

-- 7. Device Sessions
CREATE TABLE IF NOT EXISTS public.device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_label TEXT NOT NULL,
  user_agent TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_user ON public.device_sessions(user_id);

-- 8. Security Events (Non-secret metadata only)
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_id UUID REFERENCES public.vaults(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  device_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_user_created ON public.security_events(user_id, created_at DESC);

-- Optimistic Concurrency Control & Timestamps
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_vault_item_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Optimistic concurrency conflict: expected revision %, got %', OLD.revision + 1, NEW.revision
      USING ERRCODE = '40001';
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_vaults_updated ON public.vaults;
CREATE TRIGGER trg_vaults_updated
  BEFORE UPDATE ON public.vaults
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_envelopes_updated ON public.vault_key_envelopes;
CREATE TRIGGER trg_envelopes_updated
  BEFORE UPDATE ON public.vault_key_envelopes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_vault_items_revision ON public.vault_items;
CREATE TRIGGER trg_vault_items_revision
  BEFORE UPDATE ON public.vault_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vault_item_revision();

-- Enable Row Level Security on every user-owned table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_key_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Strict Ownership Policies (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON public.profiles FOR DELETE USING (auth.uid() = id);

CREATE POLICY "vaults_select_own" ON public.vaults FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "vaults_insert_own" ON public.vaults FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vaults_update_own" ON public.vaults FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vaults_delete_own" ON public.vaults FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "envelopes_select_own" ON public.vault_key_envelopes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "envelopes_insert_own" ON public.vault_key_envelopes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "envelopes_update_own" ON public.vault_key_envelopes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "envelopes_delete_own" ON public.vault_key_envelopes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "vault_items_select_own" ON public.vault_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "vault_items_insert_own" ON public.vault_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vault_items_update_own" ON public.vault_items FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vault_items_delete_own" ON public.vault_items FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "passkeys_select_own" ON public.passkey_credentials FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "passkeys_insert_own" ON public.passkey_credentials FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "passkeys_update_own" ON public.passkey_credentials FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "passkeys_delete_own" ON public.passkey_credentials FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "recovery_select_own" ON public.recovery_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "recovery_insert_own" ON public.recovery_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "recovery_update_own" ON public.recovery_config FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "recovery_delete_own" ON public.recovery_config FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "sessions_select_own" ON public.device_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sessions_insert_own" ON public.device_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions_update_own" ON public.device_sessions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions_delete_own" ON public.device_sessions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "security_events_select_own" ON public.security_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "security_events_insert_own" ON public.security_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "security_events_delete_own" ON public.security_events FOR DELETE USING (auth.uid() = user_id);

-- Realtime sync for encrypted items and key envelopes
ALTER PUBLICATION supabase_realtime ADD TABLE public.vault_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vault_key_envelopes;

