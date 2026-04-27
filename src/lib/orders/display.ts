// Shared formatters for order-context location labels.
//
// Background: orders snapshot `branch_name` at submission time (so a
// receipt printed today still reads correctly if the branch is later
// renamed or deleted). Per migration 021, default branches now carry
// name=NULL — the signal that says "this tenant only has the one
// auto-created branch, so don't bother labeling it." Explicit
// branches ("Citra 8", "Sudirman", etc.) still snapshot their name.
//
// Two formatters cover the two layouts every customer/admin surface
// uses today:
//
//   formatOrderLocationLabel({ branchName, tenantName })
//     → never returns empty. Use where the line ALWAYS prints (e.g.
//       page caption, hero subtitle on /track). Falls back to the
//       tenant name so "Sandwicherie Lakeside" reads instead of a
//       blank or "—".
//
//   formatOrderBranchSuffix(branchName)
//     → returns null when the branch is the default. Use where the
//       caller prepends a separator (" · branch") that should be
//       dropped on null. Don't print "DATE · —" or "—" alone — both
//       look like data errors.
//
// All customer/admin tenant-identity displays MUST funnel through
// these helpers. The single-resolver rule is documented in
// docs/ai-architecture.md and prevents the "third stale-name bug
// across surfaces" pattern from recurring.

export function formatOrderLocationLabel(opts: {
  branchName: string | null | undefined;
  tenantName: string;
}): string {
  const trimmed = opts.branchName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : opts.tenantName;
}

export function formatOrderBranchSuffix(
  branchName: string | null | undefined,
): string | null {
  const trimmed = branchName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
