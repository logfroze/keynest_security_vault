import type { DecryptedVaultItem } from '@/types/vault';
import { getCategoryLabel, getPrimaryIdentifier } from '../vault/schemas';

export interface CloudAiRequestOptions {
  provider: 'openai' | 'gemini';
  apiKey: string;
  prompt: string;
  includeRedactedContext: boolean;
  items: DecryptedVaultItem[];
}

export interface CloudAiResponse {
  text: string;
  provider: 'openai' | 'gemini';
}

/**
 * Builds a strictly redacted, secret-free vault index (titles, categories, non-secret identifiers, tags)
 * for optional Cloud AI queries when the user explicitly opts in. Passwords, API keys, IBANs,
 * card numbers, and TOTP secrets are NEVER included.
 */
export function buildRedactedContextSummary(items: DecryptedVaultItem[]): string {
  const active = items.filter((i) => i.deletedAt === null);
  return active
    .slice(0, 60)
    .map((item) => {
      const cat = getCategoryLabel(item.payload);
      const id = getPrimaryIdentifier(item.payload);
      const tags = item.payload.tags.join(', ');
      return `- [${cat}] "${item.payload.title}" (${id || 'no-identifier'})${tags ? ` tags: ${tags}` : ''}`;
    })
    .join('\n');
}

/**
 * Explicitly approved external Cloud AI call. Never called automatically.
 */
export async function queryOptionalCloudAi(
  options: CloudAiRequestOptions,
): Promise<CloudAiResponse> {
  if (!options.apiKey.trim()) {
    throw new Error('Please provide your API key for optional Cloud AI.');
  }

  const systemInstruction = [
    'You are KeyNest Cloud Assistant, helping organize or query a personal security vault.',
    'If asked to classify or structure raw notes, output concise structured JSON or field mappings.',
    'Never ask the user to paste unnecessary live banking passwords or CVVs.',
  ].join(' ');

  const contextBlock = options.includeRedactedContext
    ? `\n\nRedacted Vault Index (titles/categories only, all secrets stripped):\n${buildRedactedContextSummary(options.items)}`
    : '';

  const userMessage = `${options.prompt}${contextBlock}`;

  if (options.provider === 'gemini') {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(options.apiKey.trim())}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini request failed (${res.status}): ${errText.slice(0, 180)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response returned.';
    return { text, provider: 'gemini' };
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${errText.slice(0, 180)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return {
    text: data.choices?.[0]?.message?.content ?? 'No response returned.',
    provider: 'openai',
  };
}

