import { generateStrongPassword } from '../cryptography/password';
import {
  analyzeVaultSecurityHealth,
  searchAndFilterItems,
} from '../search/searchEngine';
import {
  CATEGORY_DEFINITIONS,
  getItemStrength,
  getPrimaryUrl,
} from '../vault/schemas';
import {
  parseUnstructuredImportText,
  processLocalAssistantQuery,
} from './localParser';
import type {
  DecryptedVaultItem,
  StorageBackendMode,
  VaultCategory,
  VaultItemPayload,
} from '@/types/vault';

export type CopilotUiAction =
  | { type: 'navigate'; tab: 'home' | 'vault' | 'ai' | 'settings'; vaultFilter?: VaultCategory | 'all' | 'favorites' | 'recent' | 'trash' }
  | { type: 'open_modal'; modal: 'generator' | 'security_center' | 'new_entry' }
  | { type: 'set_theme'; theme: 'light' | 'dark' }
  | { type: 'lock_vault' };

export type CopilotPendingAction =
  | {
      type: 'create_item';
      title: string;
      summaryLines: string[];
      payload: VaultItemPayload;
      generateStrongPasswordForField?: string;
    }
  | {
      type: 'bulk_import';
      title: string;
      summaryLines: string[];
      payloads: VaultItemPayload[];
    }
  | {
      type: 'update_item';
      title: string;
      summaryLines: string[];
      itemId: string;
      nextPayload: VaultItemPayload;
      generateStrongPassword?: boolean;
    }
  | {
      type: 'trash_item';
      title: string;
      summaryLines: string[];
      itemId: string;
    }
  | {
      type: 'restore_item';
      title: string;
      summaryLines: string[];
      itemId: string;
    }
  | {
      type: 'ui_action';
      title: string;
      summaryLines: string[];
      uiAction: CopilotUiAction;
    };

export interface CopilotReply {
  reply: string;
  matchedItemIds: string[];
  pendingAction: CopilotPendingAction | null;
  immediateUiAction?: CopilotUiAction | null;
  source: 'local' | 'gemini';
  model?: string;
}

export interface SafeVaultSnapshotItem {
  id: string;
  title: string;
  category: VaultCategory;
  website?: string;
  url?: string;
  endpoint?: string;
  service?: string;
  environment?: string;
  bankName?: string;
  accountTitle?: string;
  email?: string;
  username?: string;
  fullName?: string;
  tags: string[];
  favorite: boolean;
  passwordStrength?: string;
  has2FA?: boolean;
  inTrash: boolean;
  updatedAt: string;
}

export interface SafeCopilotSnapshot {
  todayDate: string;
  uiState: {
    activeTab: string;
    theme: 'light' | 'dark';
    backendMode: StorageBackendMode;
    paymentEnabled: boolean;
  };
  stats: {
    activeCount: number;
    trashCount: number;
    favoriteCount: number;
    byCategory: Record<string, number>;
  };
  health: {
    healthScore: number;
    weakItemIds: string[];
    reusedItemIds: string[];
    missing2faLoginIds: string[];
  };
  items: SafeVaultSnapshotItem[];
}

/**
 * Builds a Zero-Knowledge Safe Vault Snapshot for AI context.
 * All secret values (passwords, API keys, IBANs, card numbers, CVVs, TOTP seeds) are strictly excluded.
 */
export function buildSafeCopilotSnapshot(
  items: DecryptedVaultItem[],
  uiState: SafeCopilotSnapshot['uiState'],
): SafeCopilotSnapshot {
  const active = items.filter((i) => i.deletedAt === null);
  const trash = items.filter((i) => i.deletedAt !== null);
  const health = analyzeVaultSecurityHealth(items);

  const byCategory: Record<string, number> = {};
  for (const item of active) {
    byCategory[item.payload.category] = (byCategory[item.payload.category] ?? 0) + 1;
  }

  const safeItems: SafeVaultSnapshotItem[] = items.slice(0, 150).map((item) => {
    const f = item.payload.fields;
    const strength = getItemStrength(item);
    return {
      id: item.id,
      title: item.payload.title,
      category: item.payload.category,
      website: f.website || undefined,
      url: getPrimaryUrl(item.payload) || undefined,
      endpoint: f.endpoint || undefined,
      service: f.service || undefined,
      environment: f.environment || undefined,
      bankName: f.bankName || undefined,
      accountTitle: f.accountTitle || undefined,
      email: f.email || undefined,
      username: f.username || undefined,
      fullName: f.fullName || undefined,
      tags: item.payload.tags,
      favorite: item.payload.favorite,
      passwordStrength: strength?.label,
      has2FA: Boolean(f.totpSecret?.trim()),
      inTrash: item.deletedAt !== null,
      updatedAt: item.updatedAt,
    };
  });

  return {
    todayDate: new Date().toISOString().slice(0, 10),
    uiState,
    stats: {
      activeCount: active.length,
      trashCount: trash.length,
      favoriteCount: active.filter((i) => i.payload.favorite).length,
      byCategory,
    },
    health: {
      healthScore: health.healthScore,
      weakItemIds: health.weakItemIds,
      reusedItemIds: health.reusedItemIds,
      missing2faLoginIds: health.missing2faLoginIds,
    },
    items: safeItems,
  };
}

/**
 * Fully local Zero-Knowledge Copilot supporting search, security audit,
 * UI navigation/theme control, item creation/update/trash/import drafts.
 */
export function processLocalCopilotTurn(
  message: string,
  items: DecryptedVaultItem[],
  uiState: SafeCopilotSnapshot['uiState'],
): CopilotReply {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // 1. Theme switch commands
  if (/\b(dark\s*(?:mode|theme)|switch\s+to\s+dark|enable\s+dark)\b/i.test(lower)) {
    return {
      reply: 'Switched KeyNest to **Dark Theme**.',
      matchedItemIds: [],
      pendingAction: null,
      immediateUiAction: { type: 'set_theme', theme: 'dark' },
      source: 'local',
    };
  }
  if (/\b(light\s*(?:mode|theme)|switch\s+to\s+light|enable\s+light)\b/i.test(lower)) {
    return {
      reply: 'Switched KeyNest to **Light Theme** for crisp daytime readability.',
      matchedItemIds: [],
      pendingAction: null,
      immediateUiAction: { type: 'set_theme', theme: 'light' },
      source: 'local',
    };
  }

  // 2. Direct UI navigation & tools
  if (/\b(open|show|launch)\b.*\b(password\s*generator|generate\s*password)\b/i.test(lower)) {
    return {
      reply: 'Opening the **Password Generator**.',
      matchedItemIds: [],
      pendingAction: null,
      immediateUiAction: { type: 'open_modal', modal: 'generator' },
      source: 'local',
    };
  }
  if (/\b(generate|create|make)\s+(?:a\s+)?(?:new\s+)?(?:strong\s+)?password\b/i.test(lower) && !/\bfor\b/i.test(lower)) {
    const pw = generateStrongPassword({ length: 22 });
    return {
      reply: `Generated a strong 22-character password locally: \`${pw}\` — or open the Password Generator modal to customize it.`,
      matchedItemIds: [],
      pendingAction: {
        type: 'ui_action',
        title: 'Open Password Generator Tool',
        summaryLines: ['Customize length, symbols, and entropy'],
        uiAction: { type: 'open_modal', modal: 'generator' },
      },
      source: 'local',
    };
  }
  if (/\b(open|show|check)\b.*\b(security\s*center|password\s*health|health\s*score)\b/i.test(lower)) {
    const health = analyzeVaultSecurityHealth(items);
    return {
      reply: `Your current local **Vault Health Score** is **${health.healthScore}%** (${health.weakItemIds.length} weak, ${health.reusedItemIds.length} reused, ${health.missing2faLoginIds.length} logins without 2FA). Opening Security Center.`,
      matchedItemIds: [...new Set([...health.weakItemIds, ...health.reusedItemIds])].slice(0, 4),
      pendingAction: null,
      immediateUiAction: { type: 'open_modal', modal: 'security_center' },
      source: 'local',
    };
  }
  if (/\b(open|go\s+to|show)\s+(settings|preferences|backup|passkey)\b/i.test(lower)) {
    return {
      reply: 'Opening **Settings**.',
      matchedItemIds: [],
      pendingAction: null,
      immediateUiAction: { type: 'navigate', tab: 'settings' },
      source: 'local',
    };
  }
  if (/\b(lock\s+(?:the\s+)?vault|lock\s+now)\b/i.test(lower)) {
    return {
      reply: 'Locking your vault and wiping in-memory encryption keys.',
      matchedItemIds: [],
      pendingAction: null,
      immediateUiAction: { type: 'lock_vault' },
      source: 'local',
    };
  }

  // 3. Multi-line unstructured bulk import -> batch confirmation card
  if (trimmed.split('\n').length >= 3 && /[:=]/.test(trimmed)) {
    const parsed = parseUnstructuredImportText(trimmed, items);
    if (parsed.totalFound > 0) {
      const ready = parsed.candidates.filter((c) => c.status !== 'duplicate');
      const toCommit = ready.length > 0 ? ready : parsed.candidates;
      return {
        reply: `Analyzed locally: detected **${parsed.totalFound}** record(s) (${parsed.readyCount} ready, ${parsed.duplicateCount} duplicate). Review the summary below and confirm to encrypt & save.`,
        matchedItemIds: [],
        pendingAction: {
          type: 'bulk_import',
          title: `Encrypt & Import ${toCommit.length} Record(s)`,
          summaryLines: toCommit.map(
            (c) =>
              `${c.payload.title} (${CATEGORY_DEFINITIONS[c.payload.category].shortLabel})`,
          ),
          payloads: toCommit.map((c) => c.payload),
        },
        source: 'local',
      };
    }
  }

  // 4. Create new item command ("Add a login for Notion with email ...")
  const createMatch = trimmed.match(
    /^(?:add|create|save|new)\s+(?:a\s+)?(?:(login|developer|api|financial|bank|personal|note|secure\s*note)\s+)?(?:entry|record|account|item)?\s*(?:for\s+)?([A-Za-z0-9._\-\s]{2,40}?)(?:\s+(?:with|using)\s+(.+))?$/i,
  );
  if (createMatch && !/\bfind|show|what|check\b/i.test(lower)) {
    const typeHint = (createMatch[1] ?? '').toLowerCase();
    const title = createMatch[2].trim();
    const extra = createMatch[3] ?? '';
    let category: VaultCategory = 'login';
    if (/dev|api/.test(typeHint)) category = 'developer_secret';
    else if (/fin|bank/.test(typeHint)) category = 'financial';
    else if (/person/.test(typeHint)) category = 'personal';
    else if (/note/.test(typeHint)) category = 'secure_note';

    const emailMatch = extra.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0] ?? '';
    const pwMatch = extra.match(/password\s*(?:is|:|=)?\s*(\S+)/i)?.[1] ?? '';
    const shouldGenPw = category === 'login' && !pwMatch;

    const payload: VaultItemPayload = {
      title,
      category,
      fields: {
        ...(category === 'login'
          ? {
              website: `${title.toLowerCase().replace(/\s+/g, '')}.com`,
              email: emailMatch,
              password: pwMatch,
            }
          : category === 'developer_secret'
            ? { service: title, email: emailMatch, environment: 'production' }
            : category === 'financial'
              ? { bankName: title }
              : category === 'secure_note'
                ? { content: extra }
                : { fullName: title, email: emailMatch }),
      },
      customFields: [],
      tags: [],
      notes: '',
      favorite: false,
      passwordHistory: [],
    };

    return {
      reply: `Prepared a new **${CATEGORY_DEFINITIONS[category].shortLabel}** entry for **${title}**${shouldGenPw ? ' (will auto-generate a strong 20-char password locally on confirm)' : ''}.`,
      matchedItemIds: [],
      pendingAction: {
        type: 'create_item',
        title: `Create "${title}"`,
        summaryLines: [
          `Category: ${CATEGORY_DEFINITIONS[category].label}`,
          emailMatch ? `Email: ${emailMatch}` : 'Email: (optional)',
          shouldGenPw ? 'Password: Auto-generate strong 20-char password' : pwMatch ? 'Password: Provided' : 'Secret: Blank / fill later',
        ],
        payload,
        generateStrongPasswordForField: shouldGenPw ? 'password' : undefined,
      },
      source: 'local',
    };
  }

  // 5. Trash / Restore commands
  const moveTrashMatch = trimmed.match(/^move\s+(?:my\s+)?(.+?)\s+to\s+trash$/i);
  const trashMatch =
    moveTrashMatch ??
    trimmed.match(/^(?:delete|remove|trash|move\s+to\s+trash)\s+(?:my\s+)?(.+)$/i);
  if (trashMatch) {
    const query = trashMatch[1].trim();
    const candidates = searchAndFilterItems(items, { search: query, category: 'all' });
    if (candidates[0]) {
      const target = candidates[0];
      return {
        reply: `Prepared to move **${target.payload.title}** to Trash. Confirm below to proceed.`,
        matchedItemIds: [target.id],
        pendingAction: {
          type: 'trash_item',
          title: `Move "${target.payload.title}" to Trash`,
          summaryLines: [
            `Category: ${CATEGORY_DEFINITIONS[target.payload.category].shortLabel}`,
            'You can restore items anytime from Trash.',
          ],
          itemId: target.id,
        },
        source: 'local',
      };
    }
  }

  const restoreMatch = trimmed.match(/^restore\s+(?:my\s+)?(.+?)(?:\s+from\s+trash)?$/i);
  if (restoreMatch) {
    const query = restoreMatch[1].trim();
    const candidates = searchAndFilterItems(items, { search: query, category: 'trash' });
    if (candidates[0]) {
      const target = candidates[0];
      return {
        reply: `Prepared to restore **${target.payload.title}** from Trash.`,
        matchedItemIds: [target.id],
        pendingAction: {
          type: 'restore_item',
          title: `Restore "${target.payload.title}"`,
          summaryLines: ['Moves item back into your active encrypted vault'],
          itemId: target.id,
        },
        source: 'local',
      };
    }
  }

  // 6. Rotate password with generated password ("rotate/change my Facebook password")
  const rotateMatch = trimmed.match(
    /^(?:rotate|refresh|regenerate|update)\s+(?:my\s+)?(.+?)\s+password(?:\s+automatically|\s+with\s+(?:a\s+)?(?:new|strong)\s+password)?$/i,
  );
  if (rotateMatch && !/\s+to\s+\S+$/i.test(trimmed)) {
    const targetQuery = rotateMatch[1].trim();
    const candidates = searchAndFilterItems(items, { search: targetQuery, category: 'all' });
    if (candidates[0]) {
      const target = candidates[0];
      return {
        reply: `Prepared a local **Password Rotation** for **${target.payload.title}**. Clicking Confirm generates a fresh 22-character password locally, archives the old password in Password History, and encrypts immediately.`,
        matchedItemIds: [target.id],
        pendingAction: {
          type: 'update_item',
          title: `Rotate Password for "${target.payload.title}"`,
          summaryLines: [
            'Generates strong 22-character password locally',
            'Saves previous password into encrypted Password History',
          ],
          itemId: target.id,
          nextPayload: target.payload,
          generateStrongPassword: true,
        },
        source: 'local',
      };
    }
  }

  // 7. Standard Local Natural Language Search / Update Draft / Health Audit
  const localResp = processLocalAssistantQuery(trimmed, items);
  if (localResp.draftUpdate) {
    return {
      reply: localResp.message,
      matchedItemIds: [localResp.draftUpdate.itemId],
      pendingAction: {
        type: 'update_item',
        title: `Update "${localResp.draftUpdate.itemTitle}"`,
        summaryLines: [
          `Field: ${localResp.draftUpdate.fieldLabel}`,
          `Previous: ${localResp.draftUpdate.previousValueMasked}`,
          'New value ready to encrypt locally',
        ],
        itemId: localResp.draftUpdate.itemId,
        nextPayload: localResp.draftUpdate.nextPayload,
      },
      source: 'local',
    };
  }

  if (localResp.intent === 'health_report') {
    const health = analyzeVaultSecurityHealth(items);
    return {
      reply: `${localResp.message} Overall health score: **${health.healthScore}%**.`,
      matchedItemIds: localResp.matchedItems.map((i) => i.id),
      pendingAction:
        health.weakItemIds.length > 0
          ? {
              type: 'ui_action',
              title: 'Open Security Health Center',
              summaryLines: [
                `${health.weakItemIds.length} weak password(s)`,
                `${health.reusedItemIds.length} reused password(s)`,
              ],
              uiAction: { type: 'open_modal', modal: 'security_center' },
            }
          : null,
      source: 'local',
    };
  }

  // Overview / stats question
  if (/\b(summary|overview|how\s+many|stats|count|status)\b/i.test(lower)) {
    const snap = buildSafeCopilotSnapshot(items, uiState);
    return {
      reply: `You currently have **${snap.stats.activeCount}** active encrypted items (**${snap.stats.favoriteCount}** favorites, **${snap.stats.trashCount}** in Trash) and a **${snap.health.healthScore}%** Security Health Score.`,
      matchedItemIds: [],
      pendingAction: null,
      source: 'local',
    };
  }

  return {
    reply: localResp.message,
    matchedItemIds: localResp.matchedItems.map((i) => i.id),
    pendingAction: null,
    source: 'local',
  };
}

/**
 * Safely parses structured JSON output returned by Gemini API route.
 */
export function parseGeminiCopilotResponse(
  raw: {
    reply?: string;
    matched_item_ids?: string[];
    pending_action?: CopilotPendingAction | null;
    immediate_ui_action?: CopilotUiAction | null;
    model?: string;
  },
): CopilotReply {
  return {
    reply: raw.reply?.trim() || 'Done.',
    matchedItemIds: Array.isArray(raw.matched_item_ids) ? raw.matched_item_ids : [],
    pendingAction: raw.pending_action ?? null,
    immediateUiAction: raw.immediate_ui_action ?? null,
    source: 'gemini',
    model: raw.model,
  };
}
