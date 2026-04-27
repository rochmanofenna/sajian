#!/usr/bin/env bash
# scripts/smoke-option-b.sh — verified-live check for the digital-
# payments safety gate (Option B).
#
# Asserts three invariants:
#
#   1. POST /api/order/submit with paymentMethod=qris is rejected
#      with HTTP 409 and code=DIGITAL_PAYMENTS_DISABLED.
#   2. POST /api/order/submit with paymentMethod=cashier returns 200
#      and creates a real order (cashier flow still works).
#   3. The platform_flags row for digital_payments_enabled is still
#      false after both calls (no drift from the test traffic).
#
# Side-effect-safe: the cashier-flow assertion creates a real order
# row tagged with customer_name=SAJIAN_SMOKE_TEST. Script deletes it
# at the end via service-role. If cleanup fails, retry by re-running
# the script — it's idempotent (tags + deletes by tag).
#
# Usage:
#   bash scripts/smoke-option-b.sh                 # prod (default)
#   bash scripts/smoke-option-b.sh --env=local     # http://sate-taichan-uda.localhost:3000
#   bash scripts/smoke-option-b.sh --env=prod      # explicit prod
#
# Required env (read from .env.local automatically if present):
#   NEXT_PUBLIC_SUPABASE_URL    + SUPABASE_SERVICE_ROLE_KEY
#     — used ONLY for cleanup + flag drift check, never for the
#       smoke-test POST itself (those go through the real app stack
#       just like a customer's browser would).
#
# Exits 0 on all three assertions passing, non-zero on any failure.

set -u

# ── parse args ────────────────────────────────────────────────────
ENV="prod"
TENANT_SLUG="sate-taichan-uda"
for arg in "$@"; do
  case "$arg" in
    --env=*) ENV="${arg#--env=}" ;;
    --tenant=*) TENANT_SLUG="${arg#--tenant=}" ;;
    *) echo "unknown arg: $arg" >&2 ; exit 64 ;;
  esac
done

if [ "$ENV" = "prod" ]; then
  BASE_URL="https://${TENANT_SLUG}.sajian.app"
elif [ "$ENV" = "local" ]; then
  BASE_URL="http://${TENANT_SLUG}.localhost:3000"
else
  echo "invalid --env=$ENV (use prod or local)" >&2 ; exit 64
fi

# ── load .env.local for service-role access (cleanup + flag check) ─
if [ -f /home/ryan/sajian/.env.local ]; then
  # shellcheck disable=SC1091
  set -a ; . /home/ryan/sajian/.env.local ; set +a
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ] || [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  echo "missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL in .env.local" >&2
  exit 70
fi

# ── pretty output helpers ─────────────────────────────────────────
green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
bold() { printf '\033[1m%s\033[0m\n' "$*"; }

bold "Sajian Option B — digital-payments safety gate smoke check"
echo "  Testing against: $BASE_URL"
echo "  Tenant:          $TENANT_SLUG"
echo

# ── step 0: paranoia — confirm we're hitting Sajian, not a wrong host ─
echo "→ Step 0: confirm $BASE_URL is the real Sajian storefront"
home_page=$(curl -fsSL --max-time 10 "$BASE_URL/" 2>/dev/null || true)
if [ -z "$home_page" ]; then
  red "FAIL: $BASE_URL did not respond. DNS issue, tenant inactive, or wrong env."
  exit 1
fi
if ! printf '%s' "$home_page" | grep -qi "sajian\|$TENANT_SLUG"; then
  red "FAIL: $BASE_URL responded but body doesn't look like Sajian (no 'sajian' or tenant name found)."
  red "      Tenant may be inactive or DNS is pointing at the wrong server."
  exit 1
fi
green "  OK: $BASE_URL is reachable and looks like Sajian."
echo

# ── step 1: bootstrap test data (branch + menu item from real DB) ─
echo "→ Step 1: fetch a real branch_code + menu item for the test payload"
bootstrap=$(node --env-file=/home/ryan/sajian/.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  const { data: tenant } = await sb.from('tenants').select('id, slug').eq('slug', '$TENANT_SLUG').single();
  if (!tenant) { console.log('NO_TENANT'); return; }
  const { data: branches } = await sb.from('branches').select('code').eq('tenant_id', tenant.id).eq('is_active', true).limit(1);
  const { data: items } = await sb.from('menu_items').select('id, name, price').eq('tenant_id', tenant.id).eq('is_available', true).limit(1);
  if (!branches?.length) { console.log('NO_BRANCH'); return; }
  if (!items?.length) { console.log('NO_ITEM'); return; }
  const out = {
    branch_code: branches[0].code,
    item_id: items[0].id,
    item_name: items[0].name,
    item_price: items[0].price,
  };
  console.log(JSON.stringify(out));
})();
" 2>&1)
if [[ "$bootstrap" == "NO_TENANT" || "$bootstrap" == "NO_BRANCH" || "$bootstrap" == "NO_ITEM" || -z "$bootstrap" ]]; then
  red "FAIL: bootstrap failed: $bootstrap"
  red "      Tenant '$TENANT_SLUG' must exist with at least one active branch and one available menu item."
  exit 1
fi
BRANCH_CODE=$(echo "$bootstrap" | tail -1 | node -e "let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).branch_code));")
ITEM_ID=$(echo "$bootstrap" | tail -1 | node -e "let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).item_id));")
ITEM_NAME=$(echo "$bootstrap" | tail -1 | node -e "let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).item_name));")
ITEM_PRICE=$(echo "$bootstrap" | tail -1 | node -e "let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).item_price));")
green "  OK: branch=$BRANCH_CODE item=$ITEM_NAME price=$ITEM_PRICE"
echo

# ── shared payload helpers ────────────────────────────────────────
build_payload() {
  local method="$1"
  cat <<JSON
{
  "branchCode": "$BRANCH_CODE",
  "orderType": "takeaway",
  "paymentMethod": "$method",
  "customerName": "SAJIAN_SMOKE_TEST",
  "customerPhone": "+62800000000",
  "items": [{
    "lineId": "smoke-1",
    "menuItemId": "$ITEM_ID",
    "name": "$ITEM_NAME",
    "price": $ITEM_PRICE,
    "quantity": 1,
    "modifiers": []
  }]
}
JSON
}

# Pre-clean: delete any previous SAJIAN_SMOKE_TEST orders so the
# script is rerunnable. Idempotent — DELETE with no match is fine.
node --env-file=/home/ryan/sajian/.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
sb.from('orders').delete().eq('customer_name', 'SAJIAN_SMOKE_TEST').then(()=>{});
" >/dev/null 2>&1

PASS_COUNT=0
FAIL_COUNT=0

# ── assertion 1: digital → 409 DIGITAL_PAYMENTS_DISABLED ──────────
echo "→ Assertion 1: POST /api/order/submit paymentMethod=qris  →  expect HTTP 409, code=DIGITAL_PAYMENTS_DISABLED"
res1=$(curl -sS -o /tmp/sajian-smoke-resp1.json -w "%{http_code}" -X POST "$BASE_URL/api/order/submit" \
  -H "Content-Type: application/json" \
  -H "X-Sajian-Test: smoke-option-b" \
  --data "$(build_payload qris)" \
  --max-time 20)
body1=$(cat /tmp/sajian-smoke-resp1.json)
code1=$(echo "$body1" | node -e "let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).code||'')}catch(e){console.log('')}});" 2>/dev/null)

if [ "$res1" = "409" ] && [ "$code1" = "DIGITAL_PAYMENTS_DISABLED" ]; then
  green "  PASS: HTTP $res1, code=$code1"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  red "  FAIL: expected HTTP 409 with code=DIGITAL_PAYMENTS_DISABLED"
  red "        actual: HTTP $res1"
  red "        body  : $body1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi
echo

# ── assertion 2: cashier → 200 with orderId ───────────────────────
echo "→ Assertion 2: POST /api/order/submit paymentMethod=cashier  →  expect HTTP 200 with orderId"
res2=$(curl -sS -o /tmp/sajian-smoke-resp2.json -w "%{http_code}" -X POST "$BASE_URL/api/order/submit" \
  -H "Content-Type: application/json" \
  -H "X-Sajian-Test: smoke-option-b" \
  --data "$(build_payload cashier)" \
  --max-time 30)
body2=$(cat /tmp/sajian-smoke-resp2.json)
order_id=$(echo "$body2" | node -e "let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).orderId||'')}catch(e){console.log('')}});" 2>/dev/null)

if [ "$res2" = "200" ] && [ -n "$order_id" ]; then
  green "  PASS: HTTP $res2, orderId=$order_id"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  red "  FAIL: expected HTTP 200 with orderId"
  red "        actual: HTTP $res2"
  red "        body  : $body2"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi
echo

# ── assertion 3: flag still false after the test traffic ──────────
echo "→ Assertion 3: platform_flags.digital_payments_enabled still false (no drift)"
flag_value=$(node --env-file=/home/ryan/sajian/.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
sb.from('platform_flags').select('value').eq('key', 'digital_payments_enabled').single().then(({data}) => {
  console.log(JSON.stringify(data?.value));
});
" 2>&1 | tail -1)

if [ "$flag_value" = "false" ]; then
  green "  PASS: digital_payments_enabled = false"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  red "  FAIL: expected digital_payments_enabled = false"
  red "        actual: $flag_value"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi
echo

# ── cleanup: delete every SAJIAN_SMOKE_TEST order (idempotent) ────
echo "→ Cleanup: deleting SAJIAN_SMOKE_TEST order rows"
deleted=$(node --env-file=/home/ryan/sajian/.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
sb.from('orders').delete().eq('customer_name', 'SAJIAN_SMOKE_TEST').select('id').then(({data}) => {
  console.log((data ?? []).length);
});
" 2>&1 | tail -1)
green "  OK: removed $deleted test order(s)"
echo

# ── summary ───────────────────────────────────────────────────────
bold "Summary"
echo "  passed: $PASS_COUNT/3"
echo "  failed: $FAIL_COUNT/3"
echo
if [ "$FAIL_COUNT" = "0" ]; then
  green "Option B verified-live ✓"
  exit 0
else
  red "Option B NOT verified — investigate failures above before declaring launch-ready."
  exit 1
fi
