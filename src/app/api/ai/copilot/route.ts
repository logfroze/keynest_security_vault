import { NextResponse } from 'next/server';
import type { SafeCopilotSnapshot } from '@/modules/ai/copilotEngine';

const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
];

function getServerGeminiKey(): string | null {
  const raw = process.env.GEMINI_API_KEY?.trim();
  return raw && raw.length > 10 ? raw : null;
}

export async function GET() {
  return NextResponse.json({
    serverGeminiConfigured: Boolean(getServerGeminiKey()),
  });
}

function buildSystemInstruction(snapshot: SafeCopilotSnapshot): string {
  return `You are **KeyNest AI**, the built-in Zero-Knowledge Copilot inside **KeyNest** (a personal encrypted password, developer secret, and financial vault).

CRITICAL PRIVACY & ZERO-KNOWLEDGE RULES:
- The vault snapshot below contains ONLY non-secret metadata (titles, categories, URLs, emails, usernames, tags, password strength scores, 2FA presence). Plaintext passwords, API keys, IBANs, and card numbers are NEVER sent to you — they stay locally inside the user's browser memory.
- Whenever you locate items for the user, put their exact \`id\` strings into \`matched_item_ids\` so the browser renders 1-click local Copy / Reveal / Open cards directly from memory!
- Never ask the user to paste live secrets unnecessarily, and never invent item IDs.
- For ANY write/modify/delete action, populate \`pending_action\` so the user sees a confirmation card and clicks **Confirm & Encrypt**. Only set \`immediate_ui_action\` for safe read/UI navigation (theme switch, open page/modal).

ALLOWED \`immediate_ui_action\` VALUES:
- \`{ "type": "set_theme", "theme": "light" | "dark" }\`
- \`{ "type": "navigate", "tab": "home" | "vault" | "ai" | "settings", "vaultFilter"?: "all" | "favorites" | "recent" | "trash" | "login" | "developer_secret" | "financial" | "personal" | "payment" | "secure_note" }\`
- \`{ "type": "open_modal", "modal": "generator" | "security_center" | "new_entry" }\`
- \`{ "type": "lock_vault" }\`

ALLOWED \`pending_action\` SHAPES:
1. Create entry:
   \`{ "type": "create_item", "title": "Create ...", "summaryLines": ["..."], "generateStrongPasswordForField": "password" (optional), "payload": { "title": "...", "category": "login|developer_secret|financial|personal|payment|secure_note|custom", "fields": { ... }, "customFields": [], "tags": [], "notes": "", "favorite": false } }\`
2. Update entry (e.g. rotate password safely without knowing plaintext, add tags, update email/website/favorite):
   \`{ "type": "update_item", "title": "Update ...", "summaryLines": ["..."], "itemId": "<exact id from snapshot>", "generateStrongPassword": true|false, "nextPayload": { ...full payload fields to merge... } }\`
3. Move to Trash / Restore:
   \`{ "type": "trash_item" | "restore_item", "title": "...", "summaryLines": ["..."], "itemId": "<exact id>" }\`
4. Bulk import structured payloads:
   \`{ "type": "bulk_import", "title": "Import X Records", "summaryLines": ["..."], "payloads": [ ... ] }\`

Always respond ONLY with valid JSON matching:
{
  "reply": "Clear, helpful response (supports markdown **bold** and \`code\`, understands English & Roman Urdu)",
  "matched_item_ids": ["id1", ...],
  "pending_action": null | { ... },
  "immediate_ui_action": null | { ... }
}

REDACTED VAULT SNAPSHOT (NO SECRETS):
${JSON.stringify(snapshot)}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      message?: string;
      history?: Array<{ role: 'user' | 'assistant'; text: string }>;
      snapshot?: SafeCopilotSnapshot;
    };

    const userHeaderKey = req.headers.get('x-gemini-api-key')?.trim();
    const apiKey = userHeaderKey || getServerGeminiKey();

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'No Gemini API key configured. Add GEMINI_API_KEY in .env.local or paste your own key in Settings, or use Local ZK mode.',
        },
        { status: 400 },
      );
    }

    if (!body.message?.trim() || !body.snapshot) {
      return NextResponse.json(
        { error: 'Message and safe snapshot are required.' },
        { status: 400 },
      );
    }

    const systemInstruction = buildSystemInstruction(body.snapshot);
    const contents = [
      ...(body.history ?? []).slice(-6).map((turn) => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.text }],
      })),
      {
        role: 'user',
        parts: [{ text: body.message.trim() }],
      },
    ];

    let lastErr = 'Gemini API request failed.';

    for (const model of GEMINI_MODELS) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          system_instruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1400,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawText =
          data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? '')
            .join('')
            .trim() ?? '{}';

        const cleaned = rawText
          .replace(/^```json\s*/i, '')
          .replace(/```$/i, '')
          .trim();

        const parsed = JSON.parse(cleaned) as Record<string, unknown>;
        return NextResponse.json({
          ...parsed,
          model,
        });
      }

      const errBody = await res.text();
      lastErr = `HTTP ${res.status} (${model}): ${errBody.slice(0, 180)}`;
      if (res.status !== 404 && res.status !== 503) {
        break;
      }
    }

    return NextResponse.json({ error: lastErr }, { status: 502 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Unexpected Copilot server error.',
      },
      { status: 500 },
    );
  }
}

