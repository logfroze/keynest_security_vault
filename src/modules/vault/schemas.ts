import { z } from 'zod';
import type {
  CustomFieldType,
  DecryptedVaultItem,
  VaultCategory,
  VaultItemPayload,
} from '@/types/vault';
import { evaluatePasswordStrength } from '../cryptography/password';

export interface CategoryFieldDefinition {
  key: string;
  label: string;
  type: CustomFieldType | 'textarea';
  placeholder?: string;
  sensitive?: boolean;
  copyable?: boolean;
  showInSummary?: boolean;
}

export interface CategoryDefinition {
  id: VaultCategory;
  label: string;
  shortLabel: string;
  description: string;
  accentColor: string;
  requiresExtraConfirm: boolean;
  fields: CategoryFieldDefinition[];
}

export const CATEGORY_DEFINITIONS: Record<VaultCategory, CategoryDefinition> = {
  login: {
    id: 'login',
    label: 'Login Credentials',
    shortLabel: 'Logins',
    description: 'Websites, app accounts, usernames, passwords, and 2FA secrets.',
    accentColor: '#14B8A6',
    requiresExtraConfirm: false,
    fields: [
      { key: 'website', label: 'Website', type: 'text', placeholder: 'github.com', copyable: true },
      { key: 'username', label: 'Username', type: 'text', placeholder: 'logfrozeofficial', copyable: true, showInSummary: true },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'logfroze@gmail.com', copyable: true, showInSummary: true },
      { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••••••', sensitive: true, copyable: true },
      { key: 'totpSecret', label: '2FA / TOTP Secret', type: 'password', placeholder: 'JBSWY3DPEHPK3PXP', sensitive: true, copyable: true },
      { key: 'url', label: 'Login URL', type: 'url', placeholder: 'https://github.com/login', copyable: true },
    ],
  },
  developer_secret: {
    id: 'developer_secret',
    label: 'API Keys & Developer Secrets',
    shortLabel: 'Developer',
    description: 'API tokens, client secrets, webhooks, SSH/database endpoints.',
    accentColor: '#2DD4BF',
    requiresExtraConfirm: false,
    fields: [
      { key: 'service', label: 'Service', type: 'text', placeholder: 'GitHub / Supabase / OpenAI', copyable: true, showInSummary: true },
      { key: 'environment', label: 'Environment', type: 'text', placeholder: 'production / staging', copyable: false, showInSummary: true },
      { key: 'username', label: 'Username / Org', type: 'text', placeholder: 'logfrozeofficial', copyable: true },
      { key: 'email', label: 'Account Email', type: 'email', placeholder: 'logfroze@gmail.com', copyable: true },
      { key: 'apiKey', label: 'API Key / Token', type: 'password', placeholder: 'ghp_... / sk-...', sensitive: true, copyable: true },
      { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'Secret / Private Key', sensitive: true, copyable: true },
      { key: 'endpoint', label: 'Endpoint / Host', type: 'url', placeholder: 'https://api.example.com', copyable: true },
    ],
  },
  financial: {
    id: 'financial',
    label: 'Bank & Financial Info',
    shortLabel: 'Financial',
    description: 'Bank accounts, IBANs, routing numbers, and wallet references.',
    accentColor: '#38BDF8',
    requiresExtraConfirm: true,
    fields: [
      { key: 'bankName', label: 'Bank / Institution', type: 'text', placeholder: 'Bank Alfalah', copyable: true, showInSummary: true },
      { key: 'accountTitle', label: 'Account Title', type: 'text', placeholder: 'Muhammad Umar', copyable: true, showInSummary: true },
      { key: 'iban', label: 'IBAN', type: 'password', placeholder: 'PK00ALFH...', sensitive: true, copyable: true },
      { key: 'accountNumber', label: 'Account Number', type: 'password', placeholder: '0000-0000-0000', sensitive: true, copyable: true },
      { key: 'routingCode', label: 'SWIFT / Routing Code', type: 'text', placeholder: 'ALFHPKKA', copyable: true },
      { key: 'walletDetails', label: 'Wallet / Branch Details', type: 'textarea', placeholder: 'Branch code or wallet address', copyable: true },
    ],
  },
  personal: {
    id: 'personal',
    label: 'Personal Information',
    shortLabel: 'Personal',
    description: 'Full names, emails, phone numbers, addresses, and ID records.',
    accentColor: '#A78BFA',
    requiresExtraConfirm: false,
    fields: [
      { key: 'fullName', label: 'Full Name', type: 'text', placeholder: 'Muhammad Umar', copyable: true, showInSummary: true },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'logfroze@gmail.com', copyable: true, showInSummary: true },
      { key: 'phone', label: 'Phone Number', type: 'text', placeholder: '+92 300 0000000', copyable: true },
      { key: 'address', label: 'Address', type: 'textarea', placeholder: 'Street, City, Country', copyable: true },
      { key: 'idNumber', label: 'ID / Passport Number', type: 'password', placeholder: '00000-0000000-0', sensitive: true, copyable: true },
      { key: 'dateOfBirth', label: 'Date of Birth', type: 'date', copyable: true },
    ],
  },
  payment: {
    id: 'payment',
    label: 'Cards & Payment Details',
    shortLabel: 'Payment',
    description: 'Payment cards and billing details with explicit reveal confirmation.',
    accentColor: '#F59E0B',
    requiresExtraConfirm: true,
    fields: [
      { key: 'cardholder', label: 'Cardholder Name', type: 'text', placeholder: 'Muhammad Umar', copyable: true, showInSummary: true },
      { key: 'cardNumber', label: 'Card Number', type: 'password', placeholder: '4242 •••• •••• 4242', sensitive: true, copyable: true },
      { key: 'expiryDate', label: 'Expiry (MM/YY)', type: 'text', placeholder: '08/29', copyable: true, showInSummary: true },
      { key: 'cvv', label: 'Security Code (CVV)', type: 'password', placeholder: '•••', sensitive: true, copyable: true },
      { key: 'billingAddress', label: 'Billing Details', type: 'textarea', placeholder: 'Billing address & ZIP', copyable: true },
    ],
  },
  secure_note: {
    id: 'secure_note',
    label: 'Secure Notes',
    shortLabel: 'Secure notes',
    description: 'Recovery codes, private notes, backup instructions, and misc secrets.',
    accentColor: '#10B981',
    requiresExtraConfirm: false,
    fields: [
      { key: 'content', label: 'Secure Note Content', type: 'textarea', placeholder: 'Recovery codes, SSH instructions, private notes...', sensitive: true, copyable: true, showInSummary: true },
    ],
  },
  custom: {
    id: 'custom',
    label: 'Custom Category',
    shortLabel: 'Custom',
    description: 'Flexible entry with custom category title and user-defined fields.',
    accentColor: '#94A3B8',
    requiresExtraConfirm: false,
    fields: [
      { key: 'summary', label: 'Primary Value', type: 'text', placeholder: 'Key identifier or summary', copyable: true, showInSummary: true },
      { key: 'secret', label: 'Primary Secret', type: 'password', placeholder: 'Optional secret value', sensitive: true, copyable: true },
    ],
  },
};

export const VAULT_CATEGORY_ORDER: VaultCategory[] = [
  'login',
  'developer_secret',
  'financial',
  'personal',
  'payment',
  'secure_note',
  'custom',
];

export const customFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1, 'Field label is required').max(80),
  type: z.enum(['text', 'password', 'email', 'url', 'date', 'number']),
  value: z.string().max(10000),
});

export const vaultItemPayloadSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(140),
  category: z.enum([
    'login',
    'developer_secret',
    'financial',
    'personal',
    'payment',
    'secure_note',
    'custom',
  ]),
  customCategoryName: z.string().trim().max(60).optional(),
  fields: z.record(z.string(), z.string().max(10000)),
  customFields: z.array(customFieldSchema).max(40),
  tags: z.array(z.string().trim().min(1).max(32)).max(20),
  notes: z.string().max(20000),
  favorite: z.boolean(),
  icon: z.string().max(100).optional(),
  passwordHistory: z
    .array(
      z.object({
        value: z.string(),
        changedAt: z.string(),
      }),
    )
    .max(20)
    .optional(),
  lastUsedAt: z.string().optional(),
});

export function getCategoryLabel(payload: VaultItemPayload): string {
  if (payload.category === 'custom' && payload.customCategoryName?.trim()) {
    return payload.customCategoryName.trim();
  }
  return CATEGORY_DEFINITIONS[payload.category].label;
}

export function getPrimaryIdentifier(payload: VaultItemPayload): string {
  const f = payload.fields;
  return (
    f.email ||
    f.username ||
    f.service ||
    f.accountTitle ||
    f.bankName ||
    f.fullName ||
    f.cardholder ||
    f.summary ||
    (f.content ? f.content.split('\n')[0].slice(0, 48) : '') ||
    payload.notes.split('\n')[0]?.slice(0, 48) ||
    CATEGORY_DEFINITIONS[payload.category].shortLabel
  );
}

export function getPrimaryUrl(payload: VaultItemPayload): string {
  const raw = payload.fields.url || payload.fields.website || payload.fields.endpoint || '';
  return raw.trim();
}

export function getPrimarySecret(payload: VaultItemPayload): string | null {
  const f = payload.fields;
  return (
    f.password ||
    f.apiKey ||
    f.secretKey ||
    f.iban ||
    f.accountNumber ||
    f.cardNumber ||
    f.idNumber ||
    f.secret ||
    null
  );
}

export function isSensitiveRevealRequired(
  category: VaultCategory,
  fieldKey: string,
  confirmSensitiveReveal: boolean,
): boolean {
  if (!confirmSensitiveReveal) return false;
  const def = CATEGORY_DEFINITIONS[category];
  if (!def.requiresExtraConfirm) return false;
  const fieldDef = def.fields.find((item) => item.key === fieldKey);
  return Boolean(fieldDef?.sensitive);
}

export function getItemStrength(item: DecryptedVaultItem) {
  const secret = item.payload.fields.password || item.payload.fields.secret || '';
  if (!secret) return null;
  return evaluatePasswordStrength(secret);
}

export function createEmptyPayload(category: VaultCategory): VaultItemPayload {
  const fields: Record<string, string> = {};
  for (const field of CATEGORY_DEFINITIONS[category].fields) {
    fields[field.key] = '';
  }
  return {
    title: '',
    category,
    fields,
    customFields: [],
    tags: [],
    notes: '',
    favorite: false,
    passwordHistory: [],
  };
}

