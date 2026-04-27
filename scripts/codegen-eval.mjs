// AI route eval harness. Runs prompt sets defined in ai-routes.json
// against the registered AI routes, then records action emissions and
// banned-phrase / forbidden-id leaks. The eval is the gate that
// catches prompt regressions BEFORE they ship.
//
// Usage:
//   BASE_URL=https://sajian.app \
//   AUTH_COOKIE='sb-…=…' \
//   TENANT_ID=<uuid> \
//   node scripts/codegen-eval.mjs [--route=setup|admin] [--all]
//
// Defaults to --route=setup. CI runs --all so any new AI route added
// to the registry is automatically covered the next time eval fires.
//
// Output:
//   - docs/CODEGEN_EVAL_RESULTS.md       (legacy single-route scorecard)
//   - docs/CODEGEN_EVAL_RESULTS_<route>.md per route when --all
//
// Exit 2 if any route had banned-phrase regressions. Exit 0 only if
// every prompt across every selected route hit zero forbidden phrases.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REGISTRY_PATH = path.join(__dirname, 'ai-routes.json');
const DOCS_DIR = path.join(__dirname, '..', 'docs');

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const AUTH_COOKIE = process.env.AUTH_COOKIE;
const TENANT_ID = process.env.TENANT_ID;

if (!AUTH_COOKIE || !TENANT_ID) {
  console.error('Set AUTH_COOKIE and TENANT_ID env vars (see script header).');
  process.exit(1);
}

// ── argv parsing ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const ROUTE_ARG = args.find((a) => a.startsWith('--route='))?.split('=')[1];
const RUN_ALL = args.includes('--all');

// ── registry load ─────────────────────────────────────────────────
const REGISTRY = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));

function pickRoutes() {
  if (RUN_ALL) return Object.keys(REGISTRY.routes);
  if (ROUTE_ARG) {
    if (!REGISTRY.routes[ROUTE_ARG]) {
      console.error(`Unknown route "${ROUTE_ARG}". Available: ${Object.keys(REGISTRY.routes).join(', ')}`);
      process.exit(1);
    }
    return [ROUTE_ARG];
  }
  return ['setup']; // backward-compat default
}

function promptsForRoute(routeName) {
  const route = REGISTRY.routes[routeName];
  const sets = route.prompt_sets ?? [];
  const prompts = [];
  const meta = {}; // prompt → which set it came from
  for (const setName of sets) {
    const set = REGISTRY.prompt_sets[setName];
    if (!set) continue;
    for (const p of set.prompts) {
      prompts.push(p);
      meta[p] = setName;
    }
  }
  return { prompts, meta };
}

// Roadmap prompts must call log_roadmap_request AND have a bridging
// phrase + workaround. The set name is the source of truth.
const ROADMAP_SET = 'roadmap';
const BRIDGING_PHRASES = REGISTRY.prompt_sets[ROADMAP_SET]?.must_include_bridge ?? [
  'kamu bisa',
  'sementara',
  'sambil nunggu',
  'untuk sekarang',
];

// ── forbidden phrase scanner ──────────────────────────────────────
// Mirrors src/lib/ai/system-prompt.ts BANNED_PHRASES exactly. When
// the eval evolves to import that constant directly we'll deduplicate.
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
  // Settings / team deflection.
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
  // Phase 5+ batch deflections.
  'level xendit',
  'konfigurasi xendit',
  'perlu setting di backend',
  'domain butuh setup teknis',
  'pajak diatur di sistem',
  'ongkir hardcoded',
  'ongkir di-set di backend',
  // Roadmap-pattern leak guards.
  'belum tersedia di platform',
  'belum tersedia di platform ini',
  'fitur modifier',
  'fitur upsell',
  'fitur add-on',
  'logika ordering yang',
  'logika kompleks',
  'butuh logika',
  'logika yang lebih',
  // Codegen refusal regressions.
  'belum tersedia',
  'tidak tersedia',
  'fitur ini belum',
  'fitur tersebut belum',
  'platform ini belum',
  'section type ini belum',
  'alternatif yang mirip',
  'mau pakai yang mana?',
  // Implementation-jargon leak.
  'emit action',
  'aku emit',
  'trigger action',
  'panggil function',
  'call action',
  'fire action',
  'tool call',
  'function call',
];

const UUID_RE = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;
const SHORT_ID_RE = /\b[A-Za-z0-9_-]{16,}\b/;

function scanForbidden(text) {
  if (!text || typeof text !== 'string') return [];
  const hits = [];
  const lower = text.toLowerCase();
  for (const p of FORBIDDEN_PHRASES) {
    if (lower.includes(p.toLowerCase())) hits.push(p);
  }
  const stripped = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/https?:\/\/\S+/g, '');
  if (UUID_RE.test(stripped)) hits.push('LEAK:uuid');
  if (SHORT_ID_RE.test(stripped)) hits.push('LEAK:short-id');
  return hits;
}

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

// ── route-aware request ───────────────────────────────────────────
async function askRoute(routeName, prompt) {
  const route = REGISTRY.routes[routeName];
  const url = `${BASE_URL}${route.endpoint}`;

  const body = { messages: [{ role: 'user', content: prompt }] };
  if (route.kind === 'setup') {
    body.draft = route.default_draft ?? { name: 'Eval Tenant' };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: AUTH_COOKIE,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  const message = json.message ?? '';
  return {
    status: res.status,
    actions: json.actions ?? parseActions(message),
    message,
    forbidden: scanForbidden(message),
  };
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

// ── one route execution ───────────────────────────────────────────
async function runRoute(routeName, flagState) {
  const { prompts, meta } = promptsForRoute(routeName);
  console.log(`\n=== Route: ${routeName} (${prompts.length} prompts) ===`);

  const results = [];
  const start = Date.now();
  for (let i = 0; i < prompts.length; i += 1) {
    const prompt = prompts[i];
    const setName = meta[prompt];
    const attemptStart = Date.now();
    let outcome = { prompt, set: setName, actions: [], ok: false, note: '', forbidden: [] };
    try {
      const { status, actions, forbidden, message } = await askRoute(routeName, prompt);
      outcome.actions = actions.map((a) => a.type ?? 'unknown');
      outcome.forbidden = forbidden;
      let ok = status < 400 && actions.length > 0 && forbidden.length === 0;

      if (setName === ROADMAP_SET) {
        const lower = (message ?? '').toLowerCase();
        const calledRoadmap = actions.some((a) => a.type === 'log_roadmap_request');
        const hasBridge = BRIDGING_PHRASES.some((p) => lower.includes(p.toLowerCase()));
        if (!calledRoadmap) {
          outcome.note = 'roadmap prompt did not call log_roadmap_request';
          ok = false;
        } else if (!hasBridge) {
          outcome.note = 'roadmap reply missing bridging phrase + workaround';
          ok = false;
        }
      }
      outcome.ok = ok;

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
    process.stdout.write(outcome.ok ? '.' : outcome.forbidden.length ? '!' : 'x');
    await new Promise((r) => setTimeout(r, 750));
  }
  const total = Date.now() - start;
  console.log(''); // newline after progress dots

  const firstAttemptOk = results.filter((r) => r.ok).length;
  const customAttempted = results.filter(
    (r) => r.actions.includes('add_custom_section') || r.actions.includes('update_custom_section'),
  ).length;
  const compileAttempted = results.filter((r) => r.compile).length;
  const compileOk = results.filter((r) => r.compile?.ok === true).length;
  const forbiddenHits = results.filter((r) => r.forbidden && r.forbidden.length > 0);

  return {
    route: routeName,
    flagState,
    results,
    summary: {
      total: results.length,
      firstAttemptOk,
      customAttempted,
      compileAttempted,
      compileOk,
      forbiddenHits: forbiddenHits.length,
      ms: total,
    },
  };
}

function renderScorecard(routeResult) {
  const { route, flagState, results, summary } = routeResult;
  const lines = [
    `# AI eval scorecard — ${route}`,
    '',
    `- Tenant: ${flagState.tenant_id}`,
    `- Route: ${route} → ${REGISTRY.routes[route].endpoint}`,
    `- Prompts run: ${summary.total}`,
    `- First-attempt action emitted (no forbidden phrase): ${summary.firstAttemptOk}/${summary.total} (${Math.round(
      (summary.firstAttemptOk / summary.total) * 100,
    )}%)`,
    `- Custom-section attempts: ${summary.customAttempted}/${summary.total}`,
    summary.compileAttempted > 0
      ? `- Dry-run compile success: ${summary.compileOk}/${summary.compileAttempted} (${Math.round(
          (summary.compileOk / summary.compileAttempted) * 100,
        )}%)`
      : '- Dry-run compile success: n/a',
    `- Forbidden-phrase regressions: ${summary.forbiddenHits}/${summary.total}`,
    `- Total wall time: ${summary.ms} ms`,
    '',
    '## Per-prompt outcomes',
    '',
    '| # | Set | Prompt | Actions | source_jsx | Compile | Forbidden | Time |',
    '|---|---|---|---|---|---|---|---|',
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
    lines.push(
      `| ${i + 1} | ${r.set ?? '-'} | ${short} | ${actions} | ${bytes} | ${compile} | ${forbidden} | ${r.ms} ms |`,
    );
  }
  const regs = results.filter((r) => r.forbidden && r.forbidden.length > 0);
  if (regs.length > 0) {
    lines.push('', '## Regressions detected', '');
    for (const r of regs) {
      lines.push(`- "${r.prompt}" (${r.set}) → ${r.forbidden.join(', ')}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  const flagState = await preflight();
  console.log(`preflight ok — tenant ${flagState.tenant_id} codegen_enabled=${flagState.codegen_enabled}`);

  const routes = pickRoutes();
  console.log(`Running eval against routes: ${routes.join(', ')}`);

  const allResults = [];
  for (const r of routes) {
    const result = await runRoute(r, flagState);
    allResults.push(result);
    const md = renderScorecard(result);
    const filename =
      routes.length === 1 && !RUN_ALL
        ? 'CODEGEN_EVAL_RESULTS.md'
        : `CODEGEN_EVAL_RESULTS_${r}.md`;
    writeFileSync(path.join(DOCS_DIR, filename), md);
    console.log(`\n--- ${r} scorecard ---`);
    console.log(md);
  }

  // Combined summary when --all so CI can grep one file.
  if (RUN_ALL) {
    const combined = [
      '# AI eval scorecard — all routes',
      '',
      `- Tenant: ${flagState.tenant_id}`,
      `- Routes: ${allResults.map((r) => r.route).join(', ')}`,
      '',
      '| Route | Prompts | OK | Forbidden | Wall time |',
      '|---|---|---|---|---|',
      ...allResults.map(
        (r) =>
          `| ${r.route} | ${r.summary.total} | ${r.summary.firstAttemptOk}/${r.summary.total} | ${r.summary.forbiddenHits} | ${r.summary.ms}ms |`,
      ),
    ].join('\n');
    writeFileSync(path.join(DOCS_DIR, 'CODEGEN_EVAL_RESULTS.md'), combined);
    console.log('\n--- combined ---');
    console.log(combined);
  }

  const totalForbidden = allResults.reduce((acc, r) => acc + r.summary.forbiddenHits, 0);
  if (totalForbidden > 0) {
    console.error(`\n⚠ ${totalForbidden} prompt(s) hit forbidden phrases across all routes — fix prompt before rolling out.`);
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
