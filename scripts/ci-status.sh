#!/usr/bin/env bash
# scripts/ci-status.sh — single-screen status for the latest commit.
#
# Prints:
#   HEAD       commit SHA + subject + branch
#   GITHUB     CI checks for the most recent run on the current branch
#              (or the open PR, if there is one)
#   VERCEL     latest deployment for the sajian project + state
#   SUPABASE   migration drift between local and linked remote
#
# Designed to be the last thing you run before merging or deploying.
# Three green checkmarks here = ship.
#
# Usage:
#   bash scripts/ci-status.sh           # status for current HEAD
#   bash scripts/ci-status.sh <pr-num>  # status for a specific PR
#
# Reads no env vars; relies on:
#   - gh, vercel, supabase CLIs all authed
#   - cwd = sajian repo root
#
# Exits 0 always — purely informational. Do not pipe into a gate.

set -u

# Resolve real gh binary; the user's PATH may shadow it with another
# tool of the same name (capseal venv ships a Python "gh" script).
GH="/usr/bin/gh"
if ! command -v "$GH" >/dev/null 2>&1; then
  GH="$(command -v gh 2>/dev/null || true)"
fi

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
dim() { printf '\033[2m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
red() { printf '\033[31m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }
hr() { printf '\n'; }

# ── HEAD ──────────────────────────────────────────────────────────
bold "HEAD"
git --no-pager log -1 --pretty=format:'  %h  %s%n  branch=%D%n  authored=%ar (%ae)' 2>/dev/null
hr

# ── GITHUB ────────────────────────────────────────────────────────
bold "GITHUB CHECKS"
if [ -z "${GH:-}" ] || [ ! -x "$GH" ]; then
  yellow "  gh CLI not found — install github-cli or unshadow the binary"
else
  PR_ARG="${1:-}"
  if [ -n "$PR_ARG" ]; then
    "$GH" pr checks "$PR_ARG" 2>&1 | sed 's/^/  /' || true
  else
    BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
    PR_NUM="$("$GH" pr view --json number -q .number 2>/dev/null || true)"
    if [ -n "$PR_NUM" ]; then
      dim "  PR #$PR_NUM (branch $BRANCH)"
      "$GH" pr checks "$PR_NUM" 2>&1 | sed 's/^/  /' || true
    else
      dim "  no open PR for branch $BRANCH — showing last 5 workflow runs"
      "$GH" run list --branch "$BRANCH" --limit 5 2>&1 | sed 's/^/  /' || true
    fi
  fi
fi
hr

# ── VERCEL ────────────────────────────────────────────────────────
bold "VERCEL"
if ! command -v vercel >/dev/null 2>&1; then
  yellow "  vercel CLI not installed"
else
  # Latest 5 production deployments for the linked project.
  vercel list --yes 2>/dev/null | head -10 | sed 's/^/  /' || dim "  vercel list failed"
fi
hr

# ── SUPABASE ──────────────────────────────────────────────────────
bold "SUPABASE MIGRATIONS"
if ! command -v supabase >/dev/null 2>&1; then
  yellow "  supabase CLI not installed"
else
  # `migration list` shows local-vs-remote diff; pending rows have an
  # empty Remote column. Failure path (network, missing link) just
  # surfaces the CLI error so the operator sees it.
  supabase migration list 2>&1 | sed 's/^/  /' || true
fi
hr

# ── SUMMARY ───────────────────────────────────────────────────────
dim "Run scripts/ci-status.sh after every push to main / before each manual deploy."
