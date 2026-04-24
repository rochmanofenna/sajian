// Structured log + Sentry + Supabase sink for codegen events.
//
// Three backends, all best-effort, all fire-and-forget:
//
//   1. console.log — single JSON line per event (Vercel Log Drains +
//      grep-friendly, historical compatibility).
//   2. Sentry — captureException for errors / double_failures / render
//      errors, captureMessage for sanitizer_reject warnings, breadcrumb
//      for everything else. Every scope carries tenant_id + section_id
//      tags so dashboards can group by tenant.
//   3. Supabase `codegen_events` — durable, queryable stream that powers
//      /api/internal/codegen-metrics and /admin/codegen. Writes are
//      awaited on a Promise.allSettled so a DB hiccup never propagates
//      back to the caller.
//
// All three backends fail-silent. The caller should never care.

import * as Sentry from '@sentry/nextjs';
import { createServiceClient } from '@/lib/supabase/service';

const MAX_PROMPT_EXCERPT = 160;
const MAX_ERROR_MESSAGE = 400;

type Tenant = { id: string };

function clip(s: string | undefined | null, max: number): string | undefined {
  if (!s) return undefined;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// Severity mapping. Drives both Sentry routing and /admin/codegen's
// "fatal rate" widget without the caller having to know either.
export type CodegenEventType =
  | 'codegen_attempt'
  | 'codegen_sanitizer_reject'
  | 'codegen_compile_success'
  | 'codegen_compile_error'
  | 'codegen_retry'
  | 'codegen_double_failure'
  | 'codegen_section_render_error';

const SEVERITY: Record<CodegenEventType, 'info' | 'warning' | 'error' | 'fatal'> = {
  codegen_attempt: 'info',
  codegen_sanitizer_reject: 'warning',
  codegen_compile_success: 'info',
  codegen_compile_error: 'error',
  codegen_retry: 'info',
  codegen_double_failure: 'error',
  codegen_section_render_error: 'fatal',
};

function consoleLog(event: CodegenEventType, payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({ event, ts: new Date().toISOString(), ...payload }),
  );
}

function sentryEmit(event: CodegenEventType, payload: Record<string, unknown>, err?: unknown): void {
  if (!process.env.SENTRY_DSN) return;
  try {
    Sentry.withScope((scope) => {
      if (typeof payload.tenant_id === 'string') scope.setTag('tenant_id', payload.tenant_id);
      if (typeof payload.section_id === 'string') scope.setTag('section_id', payload.section_id);
      scope.setTag('codegen_event', event);
      scope.setContext('codegen', payload);
      const level = SEVERITY[event];
      if (level === 'info') {
        scope.addBreadcrumb({
          category: 'codegen',
          level: 'info',
          message: event,
          data: payload,
        });
        return;
      }
      if (err !== undefined) {
        scope.setLevel(level === 'fatal' ? 'fatal' : 'error');
        Sentry.captureException(err);
        return;
      }
      scope.setLevel(level);
      Sentry.captureMessage(event, level);
    });
  } catch {
    // Never let Sentry break a compile path.
  }
}

function persistEvent(event: CodegenEventType, payload: Record<string, unknown>): void {
  const tenantId = typeof payload.tenant_id === 'string' ? payload.tenant_id : null;
  if (!tenantId) return;
  (async () => {
    try {
      const service = createServiceClient();
      await service.from('codegen_events').insert({
        tenant_id: tenantId,
        event_type: event,
        payload,
      });
    } catch {
      // Durable storage is best-effort. The structured console log is
      // still there and Sentry already captured anything serious.
    }
  })();
}

function emit(event: CodegenEventType, payload: Record<string, unknown>, err?: unknown): void {
  consoleLog(event, payload);
  sentryEmit(event, payload, err);
  persistEvent(event, payload);
}

export function logCodegenAttempt(opts: {
  tenant: Tenant;
  prompt_excerpt: string;
  action_type: string;
  retry_number?: number;
}): void {
  emit('codegen_attempt', {
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
  emit('codegen_sanitizer_reject', {
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
  emit('codegen_compile_success', {
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
  cause?: unknown;
}): void {
  emit(
    'codegen_compile_error',
    {
      tenant_id: opts.tenant.id,
      stage: opts.stage,
      message: clip(opts.message, MAX_ERROR_MESSAGE),
      rule: opts.rule,
      path: opts.path,
    },
    opts.cause ?? new Error(opts.message),
  );
}

export function logRetry(opts: { tenant: Tenant; attempt_number: number; reason?: string }): void {
  emit('codegen_retry', {
    tenant_id: opts.tenant.id,
    attempt_number: opts.attempt_number,
    reason: clip(opts.reason, MAX_ERROR_MESSAGE),
  });
}

export function logDoubleFailure(opts: {
  tenant: Tenant;
  final_error: string;
  source_excerpt?: string;
  cause?: unknown;
}): void {
  emit(
    'codegen_double_failure',
    {
      tenant_id: opts.tenant.id,
      final_error: clip(opts.final_error, MAX_ERROR_MESSAGE),
      source_excerpt: clip(opts.source_excerpt, 400),
    },
    opts.cause ?? new Error(opts.final_error),
  );
}

export function logRenderError(opts: {
  tenant: Tenant;
  section_id: string;
  code_hash?: string | null;
  message: string;
  cause?: unknown;
}): void {
  emit(
    'codegen_section_render_error',
    {
      tenant_id: opts.tenant.id,
      section_id: opts.section_id,
      code_hash: opts.code_hash ?? null,
      message: clip(opts.message, MAX_ERROR_MESSAGE),
    },
    opts.cause ?? new Error(opts.message),
  );
}
