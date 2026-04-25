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
  // Phase 4 / Phase 5 adversarial spatial prompts — all should land
  // an action without a "mau aku buatin?" stall.
  'pindahkan logo dan nama toko ke pojok kiri atas',
  'taruh tombol pesan di tengah halaman',
  'logo melayang di pojok kanan atas',
  'overlay teks "Selamat Datang" di atas foto hero',
  'tombol whatsapp floating di kanan bawah, jangan ketutup tombol pesan',
  'pindahkan foto about ke kiri, teksnya ke kanan',
  'badge BARU di pojok kanan atas hero',
  'tombol pesan agak turun dikit, jangan tabrakan dengan headline',
  'logo, nama, tagline semua di tengah, ditumpuk vertikal',
  'taruh banner promo paling atas, di atas hero',
  // Phase 5 settings prompts — must NOT deflect to "tim bisa..."
  'hilangkan pilih cabang langsung tampilkan menu',
  'matikan multi branch, aku cuma punya 1 cabang',
  'tambahkan cabang Sudirman, Jl Sudirman no 1, 0812345',
  // Phase 5 hardening — codegen must reach for add_custom_section
  // instead of "belum tersedia" + AI must not leak implementation jargon.
  'tambahkan section article dalam bentuk post card dengan foto',
  'pindahkan section testimoni ke paling bawah di atas kontak',
  'buat section newsletter signup dengan input email',
  'tambahkan section FAQ dengan accordion',
  'tambahkan section pricing 3 paket',
  'tambahkan section timeline perjalanan toko',
  'tambahkan section comparison sebelum/sesudah',
  // Phase 5 hardening — typography is YOUR job, not the team's.
  'ganti font ke Poppins',
  'ganti heading ke Futura body ke Inter',
  'kombinasi Fraunces dengan Plus Jakarta Sans untuk heading dan body',
  // Phase 5+ batch — settings surface closure (favicon, tax, social,
  // delivery, payments, custom domain) + section-id reorder happy path.
  'set favicon ke logo baru ini',
  'set pajak 11% dan service charge 5%',
  'tambahkan zone delivery Bintaro radius 3km ongkir 8rb',
  'aktifkan QRIS dan VA BCA',
  'hubungkan domain custom satetaichanuda.com',
  'set ig dan tiktok kita @satetaichanuda',
  'pindahkan testimoni ke paling bawah di atas kontak',
  'tukar promo dan testimoni',
  'hapus section gallery',
  'balik urutan semua section',
];

// The AI must never use these phrases. They were the "I can't do that"
// crutches that got users stuck on Phase 3. The harness flags any
// response containing them so prompt regressions are caught early.
const FORBIDDEN_PHRASES = [
  'dikontrol template',
  'dikontrol otomatis sama template',
  'nggak bisa digeser',
  'tidak bisa digeser',
  'tidak bisa diubah dari sini',
  'posisinya tetap',
  'posisinya fixed',
  'belum bisa diatur manual',
  'pengaturan tombol belum bisa',
  'mau aku buatin?',
  'apakah kamu mau aku',
  'maaf belum bisa',
  // Phase 5 — settings/platform deflection patterns.
  'tim bisa',
  'tim akan',
  'aku catat requestnya buat tim',
  'aku catat request kamu',
  'lanjut edit bagian lain dulu',
  'mau lanjut edit bagian lain dulu',
  'level platform',
  'level tema',
  'level template',
  'tim teknis',
  'diubah oleh tim',
  'perlu diubah oleh',
  'ada perubahan lain yang bisa aku bantu sekarang',
  'ganti font belum bisa',
  'font belum bisa',
  // Phase 5+ batch deflections (settings surface).
  'level xendit',
  'konfigurasi xendit',
  'perlu setting di backend',
  'domain butuh setup teknis',
  'pajak diatur di sistem',
  'ongkir hardcoded',
  'ongkir di-set di backend',
  // Phase 5 hardening — codegen refusal regression patterns.
  'belum tersedia',
  'tidak tersedia',
  'fitur ini belum',
  'fitur tersebut belum',
  'platform ini belum',
  'section type ini belum',
  'alternatif yang mirip',
  'mau pakai yang mana?',
  // Implementation jargon leak.
  'emit action',
  'aku emit',
  'trigger action',
  'panggil function',
  'call action',
  'fire action',
  'tool call',
  'function call',
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
  const message = body.message ?? '';
  return {
    status: res.status,
    actions: body.actions ?? parseActions(message),
    message,
    forbidden: scanForbidden(message),
  };
}

// Regex catches UUIDs + nanoid-style 16+-char base64 strings the AI
// must NEVER paste into chat. Skips short identifiers (Indonesian
// words can hit 12+ chars) and content URLs (which legitimately
// carry hashes). Anything matching = the AI leaked an internal ID.
const UUID_RE = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;
const SHORT_ID_RE = /\b[A-Za-z0-9_-]{16,}\b/;

function scanForbidden(text) {
  if (!text || typeof text !== 'string') return [];
  const hits = [];
  const lower = text.toLowerCase();
  for (const p of FORBIDDEN_PHRASES) {
    if (lower.includes(p.toLowerCase())) hits.push(p);
  }
  // ID-leak gate: ignore anything inside a fenced code block or URL,
  // since those legitimately carry IDs.
  const stripped = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/https?:\/\/\S+/g, '');
  if (UUID_RE.test(stripped)) hits.push('LEAK:uuid');
  if (SHORT_ID_RE.test(stripped)) hits.push('LEAK:short-id');
  return hits;
}

async function dryCompile(sourceJsx) {
  try {
    const res = await fetch(`${BASE_URL}/api/sections/compile/dry-run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: AUTH_COOKIE,
      },
      body: JSON.stringify({ source_jsx: sourceJsx }),
    });
    const body = await res.json();
    return {
      ok: res.ok && body?.ok === true,
      status: res.status,
      stage: body?.stage ?? null,
      error: body?.error?.message ?? body?.error ?? null,
      bytes: sourceJsx.length,
      compile_ms: body?.compile_ms ?? null,
      path: body?.path ?? null,
    };
  } catch (err) {
    return { ok: false, reason: err.message, bytes: sourceJsx.length };
  }
}

async function preflight() {
  const res = await fetch(`${BASE_URL}/api/feature-flags/me`, {
    headers: { Cookie: AUTH_COOKIE },
  });
  if (!res.ok) {
    throw new Error(
      `feature-flags preflight failed (${res.status}). Make sure AUTH_COOKIE is a valid owner session on a tenant subdomain.`,
    );
  }
  const body = await res.json();
  if (!body.codegen_globally_enabled) {
    throw new Error('codegen_globally_enabled=false — the eval would measure nothing.');
  }
  if (!body.codegen_enabled) {
    throw new Error(
      `Tenant ${body.tenant_id} has codegen disabled. Enable it from /admin → Store → Mode lanjutan before running the eval.`,
    );
  }
  return body;
}

async function main() {
  const flagState = await preflight();
  console.log(
    `preflight ok — tenant ${flagState.tenant_id} codegen_enabled=${flagState.codegen_enabled}`,
  );

  const results = [];
  const start = Date.now();
  for (let i = 0; i < PROMPTS.length; i += 1) {
    const prompt = PROMPTS[i];
    const attemptStart = Date.now();
    let outcome = { prompt, actions: [], ok: false, note: '', forbidden: [] };
    try {
      const { status, actions, forbidden } = await askChat(prompt);
      outcome.actions = actions.map((a) => a.type ?? 'unknown');
      outcome.forbidden = forbidden;
      // A prompt is considered green ONLY if the AI emitted at least
      // one action AND used no forbidden phrases. A response that
      // says "mau aku buatin?" but also emits the action still counts
      // as a regression — the language reads as gating, even if the
      // action eventually happens.
      outcome.ok = status < 400 && actions.length > 0 && forbidden.length === 0;
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
  const customAttempted = results.filter(
    (r) =>
      r.actions.includes('add_custom_section') ||
      r.actions.includes('update_custom_section'),
  ).length;
  const compileAttempted = results.filter((r) => r.compile).length;
  const compileOk = results.filter((r) => r.compile?.ok === true).length;
  const forbiddenHits = results.filter((r) => r.forbidden && r.forbidden.length > 0);

  const lines = [
    '# Codegen eval scorecard',
    '',
    `- Tenant: ${flagState.tenant_id}`,
    `- Prompts run: ${results.length}`,
    `- First-attempt action emitted (no forbidden phrase): ${firstAttemptOk}/${results.length} (${Math.round((firstAttemptOk / results.length) * 100)}%)`,
    `- Custom-section attempts: ${customAttempted}/${results.length}`,
    compileAttempted > 0
      ? `- Dry-run compile success: ${compileOk}/${compileAttempted} (${Math.round((compileOk / compileAttempted) * 100)}%)`
      : '- Dry-run compile success: n/a',
    `- Forbidden-phrase regressions: ${forbiddenHits.length}/${results.length}`,
    `- Total wall time: ${total} ms`,
    '',
    '## Per-prompt outcomes',
    '',
    '| # | Prompt | Actions | source_jsx | Compile | Forbidden | Time |',
    '|---|---|---|---|---|---|---|',
  ];
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    const actions = r.actions.length ? r.actions.join(', ') : 'none';
    const bytes = r.source_jsx_bytes ? `${r.source_jsx_bytes} B` : '-';
    const compile = r.compile
      ? r.compile.ok
        ? `ok · ${r.compile.path ?? ''}${r.compile.compile_ms ? ` · ${r.compile.compile_ms}ms` : ''}`
        : `fail${r.compile.stage ? ` · ${r.compile.stage}` : ''}`
      : '-';
    const forbidden = r.forbidden?.length ? `⚠ ${r.forbidden.join('; ')}` : '-';
    const short = r.prompt.length > 60 ? `${r.prompt.slice(0, 60)}…` : r.prompt;
    lines.push(`| ${i + 1} | ${short} | ${actions} | ${bytes} | ${compile} | ${forbidden} | ${r.ms} ms |`);
  }
  if (forbiddenHits.length > 0) {
    lines.push('', '## Regressions detected', '');
    for (const r of forbiddenHits) {
      lines.push(`- "${r.prompt}" → ${r.forbidden.join(', ')}`);
    }
  }
  const md = lines.join('\n');
  writeFileSync(new URL('../docs/CODEGEN_EVAL_RESULTS.md', import.meta.url), md);
  console.log(md);
  if (forbiddenHits.length > 0) {
    console.error(`\n⚠ ${forbiddenHits.length} prompt(s) hit forbidden phrases — fix prompt before rolling out.`);
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
