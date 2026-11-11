import { describe, expect, it } from 'vitest';
import {
  buildSafeCopilotSnapshot,
  processLocalCopilotTurn,
} from '@/modules/ai/copilotEngine';
import { generateVek } from '@/modules/cryptography/cryptoEngine';
import { createEncryptedVaultItem } from '@/modules/vault/vaultManager';

describe('KeyNest AI Copilot Engine', () => {
  it('builds a Zero-Knowledge Safe Snapshot stripping every sensitive field', async () => {
    const vek = generateVek();
    const login = await createEncryptedVaultItem({
      vek,
      userId: 'u1',
      vaultId: 'v1',
      payload: {
        title: 'Facebook',
        category: 'login',
        fields: {
          website: 'facebook.com',
          email: 'logfroze@gmail.com',
          password: 'UltraSecretFacebookPassword!99',
          totpSecret: 'TOPSECRET2FASEED',
        },
        customFields: [],
        tags: ['Social'],
        notes: 'Do not leak',
        favorite: true,
      },
    });
    const bank = await createEncryptedVaultItem({
      vek,
      userId: 'u1',
      vaultId: 'v1',
      payload: {
        title: 'Bank Alfalah',
        category: 'financial',
        fields: {
          bankName: 'Bank Alfalah',
          accountTitle: 'Muhammad Umar',
          iban: 'PK36ALFH0000001001234567',
          accountNumber: '9988776655',
        },
        customFields: [],
        tags: ['Finance'],
        notes: '',
        favorite: false,
      },
    });

    const snapshot = buildSafeCopilotSnapshot(
      [login.decrypted, bank.decrypted],
      {
        activeTab: 'home',
        theme: 'light',
        backendMode: 'supabase',
        paymentEnabled: false,
      },
    );

    const json = JSON.stringify(snapshot);
    expect(json).toContain('Facebook');
    expect(json).toContain('Bank Alfalah');
    expect(json).toContain('logfroze@gmail.com');
    expect(json).not.toContain('UltraSecretFacebookPassword!99');
    expect(json).not.toContain('TOPSECRET2FASEED');
    expect(json).not.toContain('PK36ALFH0000001001234567');
    expect(json).not.toContain('9988776655');
  });

  it('executes theme switches, UI navigation, and creates approval cards for mutations', async () => {
    const vek = generateVek();
    const gh = await createEncryptedVaultItem({
      vek,
      userId: 'u1',
      vaultId: 'v1',
      payload: {
        title: 'GitHub',
        category: 'login',
        fields: {
          website: 'github.com',
          email: 'logfroze@gmail.com',
          password: 'weak',
        },
        customFields: [],
        tags: ['Dev'],
        notes: '',
        favorite: false,
      },
    });

    const uiState = {
      activeTab: 'vault',
      theme: 'light' as const,
      backendMode: 'supabase' as const,
      paymentEnabled: false,
    };

    const darkRes = processLocalCopilotTurn('Switch to dark mode', [gh.decrypted], uiState);
    expect(darkRes.immediateUiAction).toEqual({ type: 'set_theme', theme: 'dark' });

    const createRes = processLocalCopilotTurn(
      'Add a login for Notion with email logfroze@gmail.com',
      [gh.decrypted],
      uiState,
    );
    expect(createRes.pendingAction?.type).toBe('create_item');

    const rotateRes = processLocalCopilotTurn(
      'Rotate my GitHub password automatically',
      [gh.decrypted],
      uiState,
    );
    expect(rotateRes.pendingAction?.type).toBe('update_item');
    if (rotateRes.pendingAction?.type === 'update_item') {
      expect(rotateRes.pendingAction.generateStrongPassword).toBe(true);
    }

    const trashRes = processLocalCopilotTurn('Move GitHub to trash', [gh.decrypted], uiState);
    expect(trashRes.pendingAction?.type).toBe('trash_item');
  });
});

