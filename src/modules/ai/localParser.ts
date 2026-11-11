import {
  CATEGORY_DEFINITIONS,
  getPrimaryIdentifier,
  getPrimaryUrl,
} from '../vault/schemas';
import type {
  DecryptedVaultItem,
  VaultCategory,
  VaultItemPayload,
} from '@/types/vault';

export type ImportCandidateStatus = 'ready' | 'duplicate' | 'incomplete' | 'ambiguous';

export interface ParsedImportCandidate {
  tempId: string;
  rawText: string;
  status: ImportCandidateStatus;
  confidence: number; // 0..1
  warnings: string[];
  duplicateOfId?: string;
  duplicateOfTitle?: string;
  payload: VaultItemPayload;
}

export interface ImportAnalysisResult {
  totalFound: number;
  readyCount: number;
  duplicateCount: number;
  incompleteCount: number;
  ambiguousCount: number;
  candidates: ParsedImportCandidate[];
}

export interface AssistantDraftUpdate {
  itemId: string;
  itemTitle: string;
  fieldKey: string;
  fieldLabel: string;
  previousValueMasked: string;
  newValue: string;
  nextPayload: VaultItemPayload;
}

export interface AssistantResponse {
  mode: 'local';
  intent: 'search' | 'import_preview' | 'draft_update' | 'health_report' | 'help';
  message: string;
  matchedItems: DecryptedVaultItem[];
  importAnalysis?: ImportAnalysisResult;
  draftUpdate?: AssistantDraftUpdate;
}

const TOKEN_PATTERNS = [
  /^gh[pousr]_[A-Za-z0-9_]{10,}$/,
  /^sk-[A-Za-z0-9_-]{12,}$/,
  /^AIza[0-9A-Za-z_-]{20,}$/,
  /^AKIA[0-9A-Z]{16}$/,
  /^xox[baprs]-[A-Za-z0-9-]+$/,
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
];

const CATEGORY_HINTS: Array<{ category: VaultCategory; keywords: RegExp }> = [
  {
    category: 'developer_secret',
    keywords: /\b(api\s*key|secret\s*key|token|pat|bearer|webhook|supabase|openai|anthropic|gemini|aws|github|gitlab|stripe|ssh|endpoint|anon\s*key|service\s*role|env)\b/i,
  },
  {
    category: 'financial',
    keywords: /\b(bank|iban|account\s*title|account\s*number|swift|bic|routing|alfalah|meezan|hbl|hsbc|ubl|chase|wallet|branch)\b/i,
  },
  {
    category: 'payment',
    keywords: /\b(card\s*number|cardholder|cvv|cvc|expiry|exp|visa|mastercard|amex|debit\s*card|credit\s*card|billing)\b/i,
  },
  {
    category: 'personal',
    keywords: /\b(cnic|passport|ssn|national\s*id|phone|mobile|address|date\s*of\s*birth|dob|full\s*name)\b/i,
  },
  {
    category: 'login',
    keywords: /\b(website|url|username|password|pass|login|2fa|totp|facebook|instagram|gmail|yahoo|reddit|netflix|twitter|x\.com|linkedin|hosting)\b/i,
  },
];

function cleanUrlToTitle(urlOrHost: string): string {
  const cleaned = urlOrHost
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .split(':')[0];
  const base = cleaned.split('.')[0] ?? cleaned;
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Untitled';
}

function splitIntoBlocks(rawText: string): string[] {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  // Split by explicit horizontal dividers or blank lines
  const roughBlocks = normalized
    .split(/\n\s*(?:---+|\*\*\*+|===+)\s*\n|\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  // Also handle blocks concatenated with single newline when a new header line clearly starts
  const finalBlocks: string[] = [];
  for (const block of roughBlocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      finalBlocks.push(block);
      continue;
    }

    let current: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isKv = /^[^:=]{1,40}\s*[:=]\s*.+$/.test(line);
      const prevWasKv = current.length > 0 && /^[^:=]{1,40}\s*[:=]\s*.+$/.test(current[current.length - 1]);
      const nextIsKv = i + 1 < lines.length && /^[^:=]{1,40}\s*[:=]\s*.+$/.test(lines[i + 1]);

      if (!isKv && prevWasKv && nextIsKv && current.length >= 2) {
        finalBlocks.push(current.join('\n'));
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) {
      finalBlocks.push(current.join('\n'));
    }
  }

  return finalBlocks;
}

function mapKeyToCanonicalField(
  rawKey: string,
  categoryHint: VaultCategory | null,
): { fieldKey?: string; customLabel?: string } {
  const k = rawKey.toLowerCase().trim();

  if (/^(site|website|domain)$/.test(k)) return { fieldKey: 'website' };
  if (/^(url|link|login\s*url|portal)$/.test(k)) return { fieldKey: 'url' };
  if (/^(endpoint|host|server|base\s*url)$/.test(k)) return { fieldKey: 'endpoint' };
  if (/^(user|username|user\s*name|handle|login)$/.test(k)) return { fieldKey: 'username' };
  if (/^(email|e-mail|mail|email\s*address)$/.test(k)) return { fieldKey: 'email' };
  if (/^(pass|password|pwd|passcode|pin)$/.test(k)) return { fieldKey: 'password' };
  if (/^(2fa|totp|otp|totp\s*secret|2fa\s*secret)$/.test(k)) return { fieldKey: 'totpSecret' };

  if (/^(service|provider|platform|app)$/.test(k)) return { fieldKey: 'service' };
  if (/^(env|environment)$/.test(k)) return { fieldKey: 'environment' };
  if (/^(api\s*key|token|access\s*token|pat|key|auth\s*token|bearer)$/.test(k)) {
    return { fieldKey: 'apiKey' };
  }
  if (/^(secret|secret\s*key|client\s*secret|private\s*key)$/.test(k)) {
    return { fieldKey: 'secretKey' };
  }

  if (/^(bank|bank\s*name|institution)$/.test(k)) return { fieldKey: 'bankName' };
  if (/^(account\s*title|holder|account\s*holder|beneficiary)$/.test(k)) {
    return { fieldKey: categoryHint === 'payment' ? 'cardholder' : 'accountTitle' };
  }
  if (/^(iban)$/.test(k)) return { fieldKey: 'iban' };
  if (/^(account\s*number|acct\s*no|account\s*no|account)$/.test(k)) {
    return { fieldKey: 'accountNumber' };
  }
  if (/^(swift|bic|routing|routing\s*code|sort\s*code)$/.test(k)) {
    return { fieldKey: 'routingCode' };
  }
  if (/^(wallet|wallet\s*details|branch)$/.test(k)) return { fieldKey: 'walletDetails' };

  if (/^(full\s*name|name)$/.test(k)) return { fieldKey: 'fullName' };
  if (/^(phone|mobile|tel|phone\s*number)$/.test(k)) return { fieldKey: 'phone' };
  if (/^(address|street|home\s*address)$/.test(k)) return { fieldKey: 'address' };
  if (/^(cnic|ssn|passport|id\s*number|national\s*id)$/.test(k)) return { fieldKey: 'idNumber' };
  if (/^(dob|date\s*of\s*birth|birthday)$/.test(k)) return { fieldKey: 'dateOfBirth' };

  if (/^(cardholder|card\s*holder|name\s*on\s*card)$/.test(k)) return { fieldKey: 'cardholder' };
  if (/^(card\s*number|card|cc)$/.test(k)) return { fieldKey: 'cardNumber' };
  if (/^(expiry|exp|expiry\s*date|expiration)$/.test(k)) return { fieldKey: 'expiryDate' };
  if (/^(cvv|cvc|security\s*code)$/.test(k)) return { fieldKey: 'cvv' };
  if (/^(billing|billing\s*address)$/.test(k)) return { fieldKey: 'billingAddress' };

  if (/^(notes?|comment|info|details|recovery)$/.test(k)) return { fieldKey: '__notes__' };
  if (/^(tags?|category|label)$/.test(k)) return { fieldKey: '__tags__' };

  return { customLabel: rawKey.trim() };
}

function classifyBlock(
  rawBlock: string,
  extractedKeys: Set<string>,
): { category: VaultCategory; confidence: number } {
  const scores: Record<VaultCategory, number> = {
    login: 0,
    developer_secret: 0,
    financial: 0,
    personal: 0,
    payment: 0,
    secure_note: 0,
    custom: 0,
  };

  if (extractedKeys.has('apiKey') || extractedKeys.has('secretKey') || extractedKeys.has('endpoint')) {
    scores.developer_secret += 4;
  }
  if (extractedKeys.has('iban') || extractedKeys.has('bankName') || extractedKeys.has('accountNumber') || extractedKeys.has('accountTitle')) {
    scores.financial += 4;
  }
  if (extractedKeys.has('cardNumber') || extractedKeys.has('cvv') || extractedKeys.has('cardholder')) {
    scores.payment += 4;
  }
  if (extractedKeys.has('idNumber') || extractedKeys.has('phone') || extractedKeys.has('address') || extractedKeys.has('fullName')) {
    scores.personal += 3;
  }
  if (extractedKeys.has('password') || extractedKeys.has('website') || extractedKeys.has('url') || extractedKeys.has('totpSecret')) {
    scores.login += 3;
  }
  if (extractedKeys.has('email') || extractedKeys.has('username')) {
    scores.login += 1.5;
  }

  for (const hint of CATEGORY_HINTS) {
    if (hint.keywords.test(rawBlock)) {
      scores[hint.category] += 2;
    }
  }

  // Detect known API key prefixes inside raw block
  if (/\b(gh[pousr]_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+|AIza[0-9A-Za-z_-]+|AKIA[0-9A-Z]{16})\b/.test(rawBlock)) {
    scores.developer_secret += 3;
  }
  if (/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/.test(rawBlock)) {
    scores.financial += 3;
  }

  let bestCat: VaultCategory = 'secure_note';
  let bestScore = 0;

  for (const cat of ['developer_secret', 'financial', 'payment', 'personal', 'login'] as VaultCategory[]) {
    if (scores[cat] > bestScore) {
      bestScore = scores[cat];
      bestCat = cat;
    }
  }

  if (bestScore === 0) {
    return { category: 'secure_note', confidence: 0.55 };
  }

  const confidence = Math.min(0.98, 0.5 + bestScore * 0.08);
  return { category: bestCat, confidence };
}

function findDuplicateItem(
  candidate: VaultItemPayload,
  existingItems: DecryptedVaultItem[],
): DecryptedVaultItem | undefined {
  const active = existingItems.filter((i) => i.deletedAt === null);
  const candTitle = candidate.title.trim().toLowerCase();
  const candIdentifier = getPrimaryIdentifier(candidate).trim().toLowerCase();
  const candUrl = getPrimaryUrl(candidate).replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase();

  for (const item of active) {
    const existingTitle = item.payload.title.trim().toLowerCase();
    const existingId = getPrimaryIdentifier(item.payload).trim().toLowerCase();
    const existingUrl = getPrimaryUrl(item.payload)
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .toLowerCase();

    if (
      candTitle &&
      existingTitle === candTitle &&
      (candIdentifier === existingId || (!candIdentifier && !existingId))
    ) {
      return item;
    }
    if (candUrl && existingUrl && candUrl === existingUrl && candIdentifier && candIdentifier === existingId) {
      return item;
    }
    if (
      candidate.fields.iban &&
      item.payload.fields.iban &&
      candidate.fields.iban.replace(/\s+/g, '').toUpperCase() ===
        item.payload.fields.iban.replace(/\s+/g, '').toUpperCase()
    ) {
      return item;
    }
  }
  return undefined;
}

/**
 * Parses unstructured text (e.g., pasted notes or .txt file exports) locally inside the browser
 * into structured, reviewable VaultItemPayload candidates without sending data to any cloud service.
 */
export function parseUnstructuredImportText(
  rawText: string,
  existingItems: DecryptedVaultItem[] = [],
): ImportAnalysisResult {
  const blocks = splitIntoBlocks(rawText);
  const candidates: ParsedImportCandidate[] = [];

  blocks.forEach((block, index) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    let inferredTitle = '';
    const extractedFields: Record<string, string> = {};
    const customFields: VaultItemPayload['customFields'] = [];
    const notesParts: string[] = [];
    const tags: string[] = [];
    const extractedKeys = new Set<string>();

    // First pass: check if block header implies a category
    const hintMatch = CATEGORY_HINTS.find((h) => h.keywords.test(lines[0] ?? ''));
    const categoryHint = hintMatch?.category ?? null;

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const kvMatch = line.match(/^([^:=]{1,40})\s*[:=]\s*(.+)$/);

      if (kvMatch && !/^https?$/i.test(kvMatch[1].trim())) {
        const rawKey = kvMatch[1].trim();
        const rawVal = kvMatch[2].trim();

        if (/^(title|name|account|service|label)$/i.test(rawKey) && !inferredTitle && !/^(full\s*name)$/i.test(rawKey)) {
          inferredTitle = rawVal;
        }

        const mapped = mapKeyToCanonicalField(rawKey, categoryHint);
        if (mapped.fieldKey === '__notes__') {
          notesParts.push(rawVal);
        } else if (mapped.fieldKey === '__tags__') {
          tags.push(
            ...rawVal
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          );
        } else if (mapped.fieldKey) {
          extractedFields[mapped.fieldKey] = rawVal;
          extractedKeys.add(mapped.fieldKey);
        } else if (mapped.customLabel) {
          customFields.push({
            id: `cf-${index}-${li}`,
            label: mapped.customLabel,
            type: /secret|key|pin|pass|token/i.test(mapped.customLabel) ? 'password' : 'text',
            value: rawVal,
          });
        }
        continue;
      }

      // Non-KV lines: treat first line as title if it's short and doesn't look like a raw secret/email/url
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line);
      const isUrl = /^https?:\/\/\S+$/i.test(line);
      const isToken = TOKEN_PATTERNS.some((p) => p.test(line));
      const isIban = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i.test(line.replace(/\s+/g, ''));

      if (li === 0 && !inferredTitle && !isEmail && !isToken && !isIban && line.length <= 60) {
        inferredTitle = line
          .replace(/^\[(.*)\]$/, '$1')
          .replace(/^(?:\d+[.)]\s*|#+\s*)/, '')
          .replace(/\s+account$/i, '')
          .trim();
        if (isUrl) {
          extractedFields.url = line;
          extractedKeys.add('url');
          inferredTitle = cleanUrlToTitle(line);
        }
      } else if (isEmail && !extractedFields.email) {
        extractedFields.email = line;
        extractedKeys.add('email');
      } else if (isUrl && !extractedFields.url) {
        extractedFields.url = line;
        extractedKeys.add('url');
      } else if (isToken && !extractedFields.apiKey) {
        extractedFields.apiKey = line;
        extractedKeys.add('apiKey');
      } else if (isIban && !extractedFields.iban) {
        extractedFields.iban = line.replace(/\s+/g, '').toUpperCase();
        extractedKeys.add('iban');
      } else {
        notesParts.push(line);
      }
    }

    const { category, confidence } = classifyBlock(block, extractedKeys);

    // Ensure canonical schema keys exist
    const normalizedFields: Record<string, string> = {};
    for (const def of CATEGORY_DEFINITIONS[category].fields) {
      normalizedFields[def.key] = extractedFields[def.key] ?? '';
    }
    // Preserve extra canonical fields extracted (e.g. website + url or username + service)
    for (const [k, v] of Object.entries(extractedFields)) {
      if (!(k in normalizedFields)) {
        normalizedFields[k] = v;
      }
    }

    if (category === 'developer_secret' && !normalizedFields.service && inferredTitle) {
      normalizedFields.service = inferredTitle;
    }
    if (category === 'financial' && !normalizedFields.bankName && inferredTitle) {
      normalizedFields.bankName = inferredTitle;
    }
    if (category === 'login' && !normalizedFields.website && normalizedFields.url) {
      normalizedFields.website = normalizedFields.url;
    }
    if (category === 'secure_note' && !normalizedFields.content) {
      normalizedFields.content = notesParts.length > 0 ? notesParts.join('\n') : block;
    }

    const title =
      inferredTitle ||
      normalizedFields.service ||
      normalizedFields.bankName ||
      (normalizedFields.website ? cleanUrlToTitle(normalizedFields.website) : '') ||
      (normalizedFields.url ? cleanUrlToTitle(normalizedFields.url) : '') ||
      normalizedFields.fullName ||
      normalizedFields.email ||
      `Imported Record #${index + 1}`;

    const payload: VaultItemPayload = {
      title,
      category,
      fields: normalizedFields,
      customFields,
      tags: Array.from(new Set(tags)),
      notes: category === 'secure_note' ? '' : notesParts.join('\n'),
      favorite: false,
      passwordHistory: [],
    };

    const warnings: string[] = [];
    const duplicate = findDuplicateItem(payload, existingItems);

    if (category === 'login' && !payload.fields.password && !payload.fields.email && !payload.fields.username) {
      warnings.push('Missing username/email and password');
    } else if (category === 'login' && !payload.fields.password) {
      warnings.push('No password detected in text');
    }
    if (category === 'developer_secret' && !payload.fields.apiKey && !payload.fields.secretKey) {
      warnings.push('No API key or secret token detected');
    }
    if (category === 'financial' && !payload.fields.iban && !payload.fields.accountNumber) {
      warnings.push('No IBAN or account number detected');
    }

    let status: ImportCandidateStatus = 'ready';
    if (duplicate) {
      status = 'duplicate';
      warnings.unshift(`Matches existing vault item "${duplicate.payload.title}"`);
    } else if (confidence < 0.62) {
      status = 'ambiguous';
      warnings.push('Category inferred with low confidence — verify before saving');
    } else if (warnings.length > 0) {
      status = 'incomplete';
    }

    candidates.push({
      tempId: `import-${index + 1}`,
      rawText: block,
      status,
      confidence,
      warnings,
      duplicateOfId: duplicate?.id,
      duplicateOfTitle: duplicate?.payload.title,
      payload,
    });
  });

  return {
    totalFound: candidates.length,
    readyCount: candidates.filter((c) => c.status === 'ready').length,
    duplicateCount: candidates.filter((c) => c.status === 'duplicate').length,
    incompleteCount: candidates.filter((c) => c.status === 'incomplete').length,
    ambiguousCount: candidates.filter((c) => c.status === 'ambiguous').length,
    candidates,
  };
}

const STOP_WORDS = new Set([
  'find',
  'show',
  'get',
  'what',
  'which',
  'where',
  'my',
  'the',
  'is',
  'did',
  'i',
  'use',
  'for',
  'all',
  'me',
  'accounts',
  'account',
  'credentials',
  'credential',
  'associated',
  'with',
  'this',
  'please',
  'tell',
  'check',
  'can',
  'you',
  'give',
  'details',
  'info',
  'about',
]);

function maskValue(val: string): string {
  if (!val) return '(empty)';
  if (val.length <= 4) return '••••';
  return `${val.slice(0, 2)}${'•'.repeat(Math.min(10, val.length - 4))}${val.slice(-2)}`;
}

/**
 * Local Zero-Knowledge Natural-Language Assistant operating strictly on unlocked in-memory items.
 */
export function processLocalAssistantQuery(
  prompt: string,
  items: DecryptedVaultItem[],
): AssistantResponse {
  const trimmed = prompt.trim();
  const active = items.filter((i) => i.deletedAt === null);

  if (!trimmed) {
    return {
      mode: 'local',
      intent: 'help',
      message: 'Ask me to find a credential, audit password health, draft an update, or paste unstructured text to import.',
      matchedItems: [],
    };
  }

  // 1. Detect multi-line unstructured credential paste
  const lineCount = trimmed.split('\n').length;
  if (lineCount >= 3 && /[:=]/.test(trimmed)) {
    const analysis = parseUnstructuredImportText(trimmed, active);
    if (analysis.totalFound > 0) {
      return {
        mode: 'local',
        intent: 'import_preview',
        message: `Analyzed locally: found ${analysis.totalFound} structured record${analysis.totalFound === 1 ? '' : 's'} ready for your review before encryption.`,
        matchedItems: [],
        importAnalysis: analysis,
      };
    }
  }

  // 2. Detect update draft request ("update my Facebook password to NewPass123!")
  const updateMatch = trimmed.match(
    /^(?:update|change|set)\s+(?:my\s+)?(.+?)\s+(password|api\s*key|token|email|username)\s+(?:to|as)\s+(.+)$/i,
  );
  if (updateMatch) {
    const targetName = updateMatch[1].trim().toLowerCase();
    const fieldNameRaw = updateMatch[2].trim().toLowerCase();
    const newValue = updateMatch[3].trim();

    const matched = active.find(
      (item) =>
        item.payload.title.toLowerCase().includes(targetName) ||
        (item.payload.fields.website ?? '').toLowerCase().includes(targetName) ||
        (item.payload.fields.service ?? '').toLowerCase().includes(targetName),
    );

    if (!matched) {
      return {
        mode: 'local',
        intent: 'search',
        message: `I couldn't find an unlocked vault record matching "${updateMatch[1].trim()}" to prepare an update draft.`,
        matchedItems: [],
      };
    }

    const fieldKey =
      fieldNameRaw === 'password'
        ? 'password'
        : fieldNameRaw.includes('key') || fieldNameRaw === 'token'
          ? 'apiKey'
          : fieldNameRaw;

    const prevVal = matched.payload.fields[fieldKey] ?? '';
    const nextPayload: VaultItemPayload = {
      ...matched.payload,
      fields: {
        ...matched.payload.fields,
        [fieldKey]: newValue,
      },
    };

    return {
      mode: 'local',
      intent: 'draft_update',
      message: `Prepared an encrypted update draft for "${matched.payload.title}". Review and approve below to apply.`,
      matchedItems: [matched],
      draftUpdate: {
        itemId: matched.id,
        itemTitle: matched.payload.title,
        fieldKey,
        fieldLabel: fieldNameRaw,
        previousValueMasked: maskValue(prevVal),
        newValue,
        nextPayload,
      },
    };
  }

  // 3. Health report intent
  if (/\b(weak|reused|duplicate|health|audit|2fa)\b/i.test(trimmed)) {
    const weakMatches = active.filter((item) => {
      const pw = item.payload.fields.password;
      return pw && pw.length < 12;
    });
    return {
      mode: 'local',
      intent: 'health_report',
      message:
        weakMatches.length > 0
          ? `Found ${weakMatches.length} item(s) with shorter passwords (< 12 chars) across ${active.length} active vault entries.`
          : `All checked passwords across your ${active.length} active vault entries meet length baseline (>= 12 chars).`,
      matchedItems: weakMatches.slice(0, 8),
    };
  }

  // 4. Category-targeted queries + keyword relevance scoring
  const lower = trimmed.toLowerCase();
  let categoryBoost: VaultCategory | null = null;
  if (/\b(developer|api|token|secret)\b/.test(lower)) categoryBoost = 'developer_secret';
  else if (/\b(bank|financial|iban|money)\b/.test(lower)) categoryBoost = 'financial';
  else if (/\b(card|payment)\b/.test(lower)) categoryBoost = 'payment';
  else if (/\b(note|recovery)\b/.test(lower)) categoryBoost = 'secure_note';
  else if (/\b(personal|phone|address|id)\b/.test(lower)) categoryBoost = 'personal';
  else if (/\b(login|password|website|hosting)\b/.test(lower) && !/\bapi|token\b/.test(lower)) {
    categoryBoost = 'login';
  }

  const queryTokens = lower
    .replace(/[?!.,"']/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

  const scored = active
    .map((item) => {
      let score = 0;
      const titleLower = item.payload.title.toLowerCase();
      const allText = [
        titleLower,
        item.payload.category,
        item.payload.notes.toLowerCase(),
        ...item.payload.tags.map((t) => t.toLowerCase()),
        ...Object.entries(item.payload.fields)
          .filter(([k]) => k !== 'password' && k !== 'cvv')
          .map(([k, v]) => `${k} ${v.toLowerCase()}`),
        ...item.payload.customFields
          .filter((cf) => cf.type !== 'password')
          .map((cf) => `${cf.label.toLowerCase()} ${cf.value.toLowerCase()}`),
      ].join(' ');

      if (categoryBoost && item.payload.category === categoryBoost) {
        score += 3;
      }

      for (const token of queryTokens) {
        if (titleLower.includes(token)) score += 6;
        else if (allText.includes(token)) score += 3;
      }

      // Special email association check
      const emailInQuery = lower.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0];
      if (emailInQuery && (item.payload.fields.email ?? '').toLowerCase() === emailInQuery) {
        score += 10;
      }

      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      mode: 'local',
      intent: 'search',
      message: `No matching records found locally for "${trimmed}". Try a different website, email, tag, or paste raw credentials to import.`,
      matchedItems: [],
    };
  }

  const topItems = scored.slice(0, 6).map((s) => s.item);
  const top = topItems[0];

  let summaryHint = '';
  if (/\bemail\b/i.test(lower) && top.payload.fields.email) {
    summaryHint = ` The email on "${top.payload.title}" is ${top.payload.fields.email}.`;
  } else if (/\busername\b/i.test(lower) && top.payload.fields.username) {
    summaryHint = ` The username on "${top.payload.title}" is ${top.payload.fields.username}.`;
  }

  return {
    mode: 'local',
    intent: 'search',
    message: `Found ${scored.length} matching vault record${scored.length === 1 ? '' : 's'} locally.${summaryHint}`,
    matchedItems: topItems,
  };
}

