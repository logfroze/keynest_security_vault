import { evaluatePasswordStrength } from '../cryptography/password';
import type { DecryptedVaultItem, VaultCategory } from '@/types/vault';

export type VaultSortOption = 'updated_desc' | 'name_asc' | 'strength_asc';

export interface VaultFilterQuery {
  search?: string;
  category?: VaultCategory | 'all' | 'favorites' | 'recent' | 'trash';
  tag?: string | null;
  sort?: VaultSortOption;
}

export interface VaultSecurityHealth {
  weakItemIds: string[];
  reusedItemIds: string[];
  missing2faLoginIds: string[];
  totalSecretsChecked: number;
  healthScore: number;
}

function buildSearchableCorpus(item: DecryptedVaultItem): string {
  const parts: string[] = [
    item.payload.title,
    item.payload.category,
    item.payload.customCategoryName ?? '',
    item.payload.notes,
    ...item.payload.tags,
  ];

  // Include non-secret field values + keys; include all field keys so users can search e.g. "iban" or "email"
  for (const [key, val] of Object.entries(item.payload.fields)) {
    parts.push(key);
    // Keep password/cvv out of accidental raw text snippets, though allow searching identifiers/emails/urls/services
    if (key !== 'password' && key !== 'cvv') {
      parts.push(val);
    }
  }

  for (const cf of item.payload.customFields) {
    parts.push(cf.label);
    if (cf.type !== 'password') {
      parts.push(cf.value);
    }
  }

  return parts.join(' ').toLowerCase();
}

export function searchAndFilterItems(
  items: DecryptedVaultItem[],
  query: VaultFilterQuery,
): DecryptedVaultItem[] {
  const mode = query.category ?? 'all';
  let filtered = items.filter((item) => {
    if (mode === 'trash') return item.deletedAt !== null;
    return item.deletedAt === null;
  });

  if (mode === 'favorites') {
    filtered = filtered.filter((item) => item.payload.favorite);
  } else if (mode === 'recent') {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    filtered = filtered.filter((item) => {
      const ref = item.payload.lastUsedAt ?? item.updatedAt;
      return new Date(ref).getTime() >= sevenDaysAgo;
    });
  } else if (mode !== 'all' && mode !== 'trash') {
    filtered = filtered.filter((item) => item.payload.category === mode);
  }

  if (query.tag) {
    const targetTag = query.tag.toLowerCase();
    filtered = filtered.filter((item) =>
      item.payload.tags.some((t) => t.toLowerCase() === targetTag),
    );
  }

  const searchTokens = (query.search ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (searchTokens.length > 0) {
    filtered = filtered.filter((item) => {
      const corpus = buildSearchableCorpus(item);
      return searchTokens.every((token) => corpus.includes(token));
    });
  }

  const sort = query.sort ?? 'updated_desc';
  return [...filtered].sort((a, b) => {
    if (sort === 'name_asc') {
      return a.payload.title.localeCompare(b.payload.title);
    }
    if (sort === 'strength_asc') {
      const sa = a.payload.fields.password
        ? evaluatePasswordStrength(a.payload.fields.password).entropyBits
        : 999;
      const sb = b.payload.fields.password
        ? evaluatePasswordStrength(b.payload.fields.password).entropyBits
        : 999;
      return sa - sb;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function extractAllTags(items: DecryptedVaultItem[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.deletedAt) continue;
    for (const tag of item.payload.tags) {
      const trimmed = tag.trim();
      if (!trimmed) continue;
      counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function analyzeVaultSecurityHealth(items: DecryptedVaultItem[]): VaultSecurityHealth {
  const active = items.filter((item) => item.deletedAt === null);
  const weakItemIds: string[] = [];
  const missing2faLoginIds: string[] = [];
  const passwordBuckets = new Map<string, string[]>();
  let totalSecretsChecked = 0;

  for (const item of active) {
    const pw = item.payload.fields.password;
    if (pw) {
      totalSecretsChecked++;
      const strength = evaluatePasswordStrength(pw);
      if (strength.score <= 2) {
        weakItemIds.push(item.id);
      }
      const list = passwordBuckets.get(pw) ?? [];
      list.push(item.id);
      passwordBuckets.set(pw, list);
    }

    if (item.payload.category === 'login' && !item.payload.fields.totpSecret?.trim()) {
      missing2faLoginIds.push(item.id);
    }
  }

  const reusedSet = new Set<string>();
  for (const ids of passwordBuckets.values()) {
    if (ids.length > 1) {
      for (const id of ids) reusedSet.add(id);
    }
  }

  const reusedItemIds = Array.from(reusedSet);
  const penalty = weakItemIds.length * 14 + reusedItemIds.length * 16 + missing2faLoginIds.length * 3;
  const healthScore = totalSecretsChecked === 0 && active.length === 0
    ? 100
    : Math.max(15, Math.min(100, 100 - penalty));

  return {
    weakItemIds,
    reusedItemIds,
    missing2faLoginIds,
    totalSecretsChecked,
    healthScore,
  };
}

