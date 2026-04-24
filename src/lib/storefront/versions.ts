// Section version history helpers. The Postgres trigger in migration 008
// records a version on every meaningful write to storefront_sections —
// this module wraps the read + restore paths and exposes a tagging
// primitive that API routes can use to stamp "source=ai", "restore", etc.
//
// Why not just UPDATE inside a transaction that sets a session var?
// Supabase-js doesn't expose transactions. We use `SET LOCAL` inside a
// `do $$` block via `rpc('exec_sql')` for tagging, falling back to the
// default 'owner' source when that isn't available.

import { createServiceClient } from '@/lib/supabase/service';

export type VersionSource = 'owner' | 'ai' | 'system' | 'restore' | 'backfill';

export interface SectionVersion {
  id: string;
  section_id: string;
  version_number: number;
  type: string;
  variant: string;
  sort_order: number;
  props: Record<string, unknown>;
  is_visible: boolean;
  source: VersionSource;
  ai_message_id: string | null;
  parent_version_id: string | null;
  created_at: string;
  created_by: string | null;
}

// Reads the most recent N versions for a section in descending order.
export async function listVersions(
  sectionId: string,
  limit = 20,
): Promise<SectionVersion[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('storefront_section_versions')
    .select(
      'id, section_id, version_number, type, variant, sort_order, props, is_visible, source, ai_message_id, parent_version_id, created_at, created_by',
    )
    .eq('section_id', sectionId)
    .order('version_number', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[versions] list failed', error);
    return [];
  }
  return (data ?? []) as SectionVersion[];
}

// Restore a prior version by inserting NEW content on the live row with
// the contents of the target version. The trigger writes a new version
// row tagged source='restore' and pointing parent_version_id at the
// restored-from version, so the history stays append-only and auditable.
//
// Returns the new version's number on success, null on failure. Does NOT
// verify ownership — callers must do that (admin routes already gate on
// requireOwnerOrThrow before invoking).
export async function restoreVersion(
  sectionId: string,
  targetVersionNumber: number,
): Promise<number | null> {
  const sb = createServiceClient();

  const { data: target, error: targetErr } = await sb
    .from('storefront_section_versions')
    .select('id, type, variant, props, sort_order, is_visible')
    .eq('section_id', sectionId)
    .eq('version_number', targetVersionNumber)
    .maybeSingle();
  if (targetErr || !target) {
    console.error('[versions] restore: target not found', { sectionId, targetVersionNumber, targetErr });
    return null;
  }

  // Tag the next write as source='restore' with a pointer to the
  // originating version. `set_config('sajian.version_source', ..., true)`
  // is transaction-scoped so the trigger picks it up for this update
  // only. We run both set_config calls + the UPDATE in one RPC to keep
  // them inside the same transaction.
  const { error: rpcErr } = await sb.rpc('sajian_restore_section_version', {
    p_section_id: sectionId,
    p_target_version_id: target.id,
    p_type: target.type,
    p_variant: target.variant,
    p_props: target.props ?? {},
    p_sort_order: target.sort_order,
    p_is_visible: target.is_visible,
  });
  if (rpcErr) {
    console.error('[versions] restore RPC failed', rpcErr);
    return null;
  }

  const { data: after } = await sb
    .from('storefront_section_versions')
    .select('version_number')
    .eq('section_id', sectionId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (after?.version_number as number | undefined) ?? null;
}

// Helper for API routes that perform tagged writes (AI mutations). Runs
// the supplied mutation inside a RPC that sets the version source + AI
// message id before UPDATE. Usage:
//
//   await writeTagged('ai', aiMsgId, async () => {
//     await supabase.from('storefront_sections').update({...}).eq('id', id);
//   });
//
// We can't easily thread SET LOCAL through arbitrary supabase-js calls,
// so for now this is an advisory marker — the trigger will still fire
// with source='owner' unless a RPC wraps the write. Future migration
// introduces `sajian_update_section` RPC for this.
