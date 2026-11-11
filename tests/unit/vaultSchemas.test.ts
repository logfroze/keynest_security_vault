import { describe, expect, it } from 'vitest';
import {
  CATEGORY_DEFINITIONS,
  createEmptyPayload,
  getCategoryLabel,
  getPrimaryIdentifier,
  isSensitiveRevealRequired,
  VAULT_CATEGORY_ORDER,
  vaultItemPayloadSchema,
} from '@/modules/vault/schemas';

describe('Vault Schemas & Category Formats', () => {
  it('defines all 6 core categories plus custom category', () => {
    expect(VAULT_CATEGORY_ORDER).toEqual([
      'login',
      'developer_secret',
      'financial',
      'personal',
      'payment',
      'secure_note',
      'custom',
    ]);

    for (const cat of VAULT_CATEGORY_ORDER) {
      const empty = createEmptyPayload(cat);
      expect(empty.category).toBe(cat);
      expect(CATEGORY_DEFINITIONS[cat].fields.length).toBeGreaterThan(0);
    }
  });

  it('requires extra reveal confirmation only for sensitive financial and payment fields', () => {
    expect(isSensitiveRevealRequired('financial', 'iban', true)).toBe(true);
    expect(isSensitiveRevealRequired('financial', 'accountNumber', true)).toBe(true);
    expect(isSensitiveRevealRequired('financial', 'bankName', true)).toBe(false);
    expect(isSensitiveRevealRequired('payment', 'cardNumber', true)).toBe(true);
    expect(isSensitiveRevealRequired('payment', 'cvv', true)).toBe(true);
    expect(isSensitiveRevealRequired('login', 'password', true)).toBe(false);
    expect(isSensitiveRevealRequired('financial', 'iban', false)).toBe(false);
  });

  it('validates payloads via Zod and formats labels/identifiers', () => {
    const valid = vaultItemPayloadSchema.parse({
      title: 'My Custom Secret',
      category: 'custom',
      customCategoryName: 'Hardware Keys',
      fields: { summary: 'YubiKey Backup' },
      customFields: [
        { id: '1', label: 'PIN', type: 'password', value: '849201' },
      ],
      tags: ['Security'],
      notes: 'Stored in safe',
      favorite: true,
    });

    expect(getCategoryLabel(valid)).toBe('Hardware Keys');
    expect(getPrimaryIdentifier(valid)).toBe('YubiKey Backup');

    expect(() =>
      vaultItemPayloadSchema.parse({
        title: '   ',
        category: 'login',
        fields: {},
        customFields: [],
        tags: [],
        notes: '',
        favorite: false,
      }),
    ).toThrow();
  });
});

