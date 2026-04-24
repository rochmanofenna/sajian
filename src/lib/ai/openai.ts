// OpenAI client used exclusively for image generation (DALL-E 3). Text +
// vision still go through Claude — OpenAI here only handles pixels.
//
// The getter throws with a clear message when OPENAI_API_KEY is missing so
// API routes can catch it and fall back to the Claude SVG path instead of
// erroring with a generic "internal server error".

import OpenAI from 'openai';

let client: OpenAI | null = null;

export function hasOpenAI(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

// Download a generated image from OpenAI's CDN. The URLs expire after an
// hour, so callers MUST persist the bytes immediately.
export async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download generated image: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
