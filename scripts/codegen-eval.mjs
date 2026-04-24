// Codegen eval harness. Runs a fixed set of Indonesian natural-language
// prompts against the live /api/ai/chat endpoint and records which
// action(s) the AI emits, then POSTs any resulting source_jsx to
// /api/sections/compile so we can measure first-attempt success.
//
// Usage:
//   BASE_URL=https://sajian.app \
//   AUTH_COOKIE='sb-…=…' \
//   TENANT_ID=<uuid> \
//   node scripts/codegen-eval.mjs
//
// Output: docs/CODEGEN_EVAL_RESULTS.md with a markdown scorecard.
//
// The harness doesn't create sections it mutates; it only reads the
// action grammar from the chat response and runs a dry compile. Intent
// is to benchmark the AI's first-attempt rate, not modify the tenant.

import { writeFileSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const AUTH_COOKIE = process.env.AUTH_COOKIE;
const TENANT_ID = process.env.TENANT_ID;

if (!AUTH_COOKIE || !TENANT_ID) {
  console.error('Set AUTH_COOKIE and TENANT_ID env vars (see script header).');
  process.exit(1);
}

const PROMPTS = [
  'tambahkan tombol floating di pojok kanan bawah',
  'buat hero dengan countdown promo lebaran sampai 10 april',
  'animasi fade in pas section about muncul',
  'tambahkan badge "BARU" di foto menu pertama',
  'promo 20% diskon yang nongol jam 5-9 malam',
  'testimoni pelanggan dengan foto profil bulat',
  'logo toko muter pelan di hero',
  'banner pengumuman di atas, warnanya merah muda',
  'section jadwal operasional dengan jam buka tutup',
  'tombol whatsapp yang melayang di kanan bawah',
  'countdown ke tanggal 1 mei dengan gambar latar',
  'tambahin section testimoni 3 orang',
  'galeri foto menu dengan klik untuk zoom',
  'hero bergaya minimalis tanpa gambar',
  'promo floating yang bisa ditutup',
  'tambah section lokasi dengan peta',
  'tombol pesan yang lebih besar dan di tengah',
  'hide section about sementara',
  'ganti warna primer jadi biru laut',
  'hero dengan video latar kalau ada, kalau nggak pakai gambar',
];

function parseActions(text) {
  const out = [];
  const re = /<!--ACTION:(\{[\s\S]*?\})-->/g;
  let m;
  while ((m = re.exec(text))) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      /* skip */
    }
  }
  return out;
}

async function askChat(prompt) {
  const res = await fetch(`${BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: AUTH_COOKIE,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      draft: { name: 'Eval Tenant', colors: { primary: '#1B5E3B', accent: '#C9A84C', background: '#FDF6EC', dark: '#1A1A18' } },
    }),
  });
  const body = await res.json();
  return { status: res.status, actions: body.actions ?? parseActions(body.message ?? ''), message: body.message };
}

async function dryCompile(sourceJsx) {
  // A dry compile without persisting — we'd need a dedicated endpoint
  // for that. For now, we can't call /api/sections/compile without
  // owning an existing section. Instead, the harness records the
  // emitted source_jsx and flags compile success as "unknown" when the
  // API path isn't exposed. TODO: add /api/sections/compile/dry-run.
  return { skipped: true, reason: 'no-dry-run-endpoint', bytes: sourceJsx.length };
}

async function main() {
  const results = [];
  const start = Date.now();
  for (let i = 0; i < PROMPTS.length; i += 1) {
    const prompt = PROMPTS[i];
    const attemptStart = Date.now();
    let outcome = { prompt, actions: [], ok: false, note: '' };
    try {
      const { status, actions } = await askChat(prompt);
      outcome.actions = actions.map((a) => a.type ?? 'unknown');
      outcome.ok = status < 400 && actions.length > 0;
      const customAction = actions.find(
        (a) => a.type === 'add_custom_section' || a.type === 'update_custom_section',
      );
      if (customAction?.source_jsx) {
        const compile = await dryCompile(customAction.source_jsx);
        outcome.source_jsx_bytes = customAction.source_jsx.length;
        outcome.compile = compile;
      }
    } catch (err) {
      outcome.note = err.message;
    }
    outcome.ms = Date.now() - attemptStart;
    results.push(outcome);
    // Polite pacing so rate limits don't bite mid-run.
    await new Promise((r) => setTimeout(r, 750));
  }
  const total = Date.now() - start;

  const firstAttemptOk = results.filter((r) => r.ok).length;
  const customAttempted = results.filter((r) => r.actions.includes('add_custom_section') || r.actions.includes('update_custom_section')).length;

  const lines = [
    '# Codegen eval scorecard',
    '',
    `- Prompts run: ${results.length}`,
    `- First-attempt action emitted: ${firstAttemptOk}/${results.length} (${Math.round((firstAttemptOk / results.length) * 100)}%)`,
    `- Custom-section attempts: ${customAttempted}/${results.length}`,
    `- Total wall time: ${total} ms`,
    '',
    '## Per-prompt outcomes',
    '',
    '| # | Prompt | Actions | source_jsx | Time |',
    '|---|---|---|---|---|',
  ];
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    const actions = r.actions.length ? r.actions.join(', ') : 'none';
    const bytes = r.source_jsx_bytes ? `${r.source_jsx_bytes} B` : '-';
    const short = r.prompt.length > 60 ? `${r.prompt.slice(0, 60)}…` : r.prompt;
    lines.push(`| ${i + 1} | ${short} | ${actions} | ${bytes} | ${r.ms} ms |`);
  }
  const md = lines.join('\n');
  writeFileSync(new URL('../docs/CODEGEN_EVAL_RESULTS.md', import.meta.url), md);
  console.log(md);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
