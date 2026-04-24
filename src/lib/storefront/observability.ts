// Structured log helpers for codegen events. Every line is a single
// JSON object on stdout so Vercel Log Drains / Sentry breadcrumbs /
// grep-over-logs all stay happy. Sampling + truncation are handled
// here so call sites stay tidy.

const MAX_PROMPT_EXCERPT = 160;
const MAX_ERROR_MESSAGE = 400;

type Tenant = { id: string };

function clip(s: string | undefined | null, max: number): string | undefined {
  if (!s) return undefined;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function log(event: string, payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({ event, ts: new Date().toISOString(), ...payload }),
  );
}

export function logCodegenAttempt(opts: {
  tenant: Tenant;
  prompt_excerpt: string;
  action_type: string;
  retry_number?: number;
}): void {
  log('codegen_attempt', {
    tenant_id: opts.tenant.id,
    prompt_excerpt: clip(opts.prompt_excerpt, MAX_PROMPT_EXCERPT),
    action_type: opts.action_type,
    retry_number: opts.retry_number ?? 0,
  });
}

export function logSanitizerReject(opts: {
  tenant: Tenant;
  rule: string;
  path: string;
  message: string;
}): void {
  log('codegen_sanitizer_reject', {
    tenant_id: opts.tenant.id,
    rule: opts.rule,
    path: opts.path,
    message: clip(opts.message, MAX_ERROR_MESSAGE),
  });
}

export function logCompileSuccess(opts: {
  tenant: Tenant;
  compile_ms: number;
  bytes: number;
  cache_hit: boolean;
  path: 'slot_tree' | 'compiled';
}): void {
  log('codegen_compile_success', {
    tenant_id: opts.tenant.id,
    compile_ms: opts.compile_ms,
    bytes: opts.bytes,
    cache_hit: opts.cache_hit,
    path: opts.path,
  });
}

export function logCompileError(opts: {
  tenant: Tenant;
  stage: string;
  message: string;
  rule?: string;
  path?: string;
}): void {
  log('codegen_compile_error', {
    tenant_id: opts.tenant.id,
    stage: opts.stage,
    message: clip(opts.message, MAX_ERROR_MESSAGE),
    rule: opts.rule,
    path: opts.path,
  });
}

export function logRetry(opts: { tenant: Tenant; attempt_number: number; reason?: string }): void {
  log('codegen_retry', {
    tenant_id: opts.tenant.id,
    attempt_number: opts.attempt_number,
    reason: clip(opts.reason, MAX_ERROR_MESSAGE),
  });
}

export function logDoubleFailure(opts: {
  tenant: Tenant;
  final_error: string;
  source_excerpt?: string;
}): void {
  log('codegen_double_failure', {
    tenant_id: opts.tenant.id,
    final_error: clip(opts.final_error, MAX_ERROR_MESSAGE),
    source_excerpt: clip(opts.source_excerpt, 400),
  });
}

export function logRenderError(opts: {
  tenant: Tenant;
  section_id: string;
  code_hash?: string | null;
  message: string;
}): void {
  log('codegen_section_render_error', {
    tenant_id: opts.tenant.id,
    section_id: opts.section_id,
    code_hash: opts.code_hash ?? null,
    message: clip(opts.message, MAX_ERROR_MESSAGE),
  });
}
