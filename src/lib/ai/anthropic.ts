// Single Anthropic client shared by all /api/ai/* routes.
//
// Model pinning: we use claude-sonnet-4-6 for vision + chat. Onboarding
// latency matters more than raw reasoning depth — Sonnet 4.6 is the right
// speed/quality tradeoff for menu OCR, color extraction, and guided chat.

import Anthropic from '@anthropic-ai/sdk';

export const CLAUDE_MODEL = 'claude-sonnet-4-6';

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Missing ANTHROPIC_API_KEY');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

// Recover JSON from Claude output even when it adds ```json fences, a
// leading preamble ("Here's the JSON:"), or a trailing sign-off. Falls back
// to the first `{` … last `}` slice so stray prose doesn't break parsing.
export function extractJson<T>(text: string): T {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) throw new Error('no JSON object found');
    return JSON.parse(stripped.slice(start, end + 1)) as T;
  }
}
