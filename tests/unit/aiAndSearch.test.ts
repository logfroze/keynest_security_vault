import { describe, expect, it } from 'vitest';
import { buildRedactedContextSummary } from '@/modules/ai/cloudAi';
import {
  parseUnstructuredImportText,
  processLocalAssistantQuery,
} from '@/modules/ai/localParser';
import { generateVek } from '@/modules/cryptography/cryptoEngine';
import { analyzeVaultSecurityHealth, searchAndFilterItems } from '@/modules/search/searchEngine';
import { createEncryptedVaultItem } from '@/modules/vault/vaultManager';

const DETAILS_MD_SAMPLE = `Facebook account
Email: logfroze@gmail.com
Password: mypassword123
Website: facebook.com

GitHub
Username: logfrozeofficial
Email: logfroze@gmail.com
Token: ghp_xxxxxxxxx12345

Bank Alfalah
Account title: Muhammad Umar
IBAN: PK36ALFH0000001001234567`;

describe('Local AI Parser, Natural Search & Cloud Privacy Redaction', () => {
  it('parses unstructured multi-account text locally into proper categories and fields', () => {
    const analysis = parseUnstructuredImportText(DETAILS_MD_SAMPLE, []);

    expect(analysis.totalFound).toBe(3);

    const fb = analysis.candidates[0];
    expect(fb.payload.title).toBe('Facebook');
    expect(fb.payload.category).toBe('login');
    expect(fb.payload.fields.email).toBe('logfroze@gmail.com');
    expect(fb.payload.fields.password).toBe('mypassword123');
    expect(fb.payload.fields.website).toBe('facebook.com');

    const gh = analysis.candidates[1];
    expect(gh.payload.title).toBe('GitHub');
    expect(gh.payload.category).toBe('developer_secret');
    expect(gh.payload.fields.username).toBe('logfrozeofficial');
    expect(gh.payload.fields.apiKey).toBe('ghp_xxxxxxxxx12345');

    const bank = analysis.candidates[2];
    expect(bank.payload.title).toBe('Bank Alfalah');
    expect(bank.payload.category).toBe('financial');
    expect(bank.payload.fields.accountTitle).toBe('Muhammad Umar');
    expect(bank.payload.fields.iban).toBe('PK36ALFH0000001001234567');
  });

  it('flags duplicates against existing vault items and answers natural-language queries', async () => {
    const vek = generateVek();
    const existing = await createEncryptedVaultItem({
      vek,
      userId: 'u1',
      vaultId: 'v1',
      payload: {
        title: 'GitHub',
        category: 'developer_secret',
        fields: {
          service: 'GitHub',
          username: 'logfrozeofficial',
          email: 'logfroze@gmail.com',
          apiKey: 'ghp_liveSecretToken999',
        },
        customFields: [],
        tags: ['Dev'],
        notes: 'Primary git token',
        favorite: true,
      },
    });

    const existingFb = await createEncryptedVaultItem({
      vek,
      userId: 'u1',
      vaultId: 'v1',
      payload: {
        title: 'Facebook',
        category: 'login',
        fields: {
          website: 'facebook.com',
          email: 'logfroze@gmail.com',
          password: 'mypassword123',
        },
        customFields: [],
        tags: ['Social'],
        notes: '',
        favorite: false,
      },
    });

    const items = [existing.decrypted, existingFb.decrypted];

    // Duplicate detection on re-import
    const reimport = parseUnstructuredImportText(DETAILS_MD_SAMPLE, items);
    expect(reimport.duplicateCount).toBe(2);

    // Local NL search
    const ghQuery = processLocalAssistantQuery('Find my GitHub API token', items);
    expect(ghQuery.intent).toBe('search');
    expect(ghQuery.matchedItems[0].payload.title).toBe('GitHub');

    // Draft update requires explicit approval
    const updateQuery = processLocalAssistantQuery(
      'Update my Facebook password to UltraSafe#2026!',
      items,
    );
    expect(updateQuery.intent).toBe('draft_update');
    expect(updateQuery.draftUpdate?.itemId).toBe(existingFb.decrypted.id);
    expect(updateQuery.draftUpdate?.newValue).toBe('UltraSafe#2026!');

    // Redacted Cloud AI summary NEVER includes passwords or tokens
    const redacted = buildRedactedContextSummary(items);
    expect(redacted).toContain('GitHub');
    expect(redacted).not.toContain('ghp_liveSecretToken999');
    expect(redacted).not.toContain('mypassword123');

    // Search and security health
    expect(searchAndFilterItems(items, { search: 'logfroze@gmail.com' })).toHaveLength(2);
    const health = analyzeVaultSecurityHealth(items);
    expect(health.weakItemIds).toContain(existingFb.decrypted.id);
  });
});

