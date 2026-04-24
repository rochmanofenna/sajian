-- Sajian Phase 2.5: RLS hardening + tenant public view + small policy cleanup.
--
-- Three things here:
--   1. orders RLS — replace the permissive `using (true)` with owner-scoped
--      read. Customers never hit the orders table directly in production
--      (the /track/[id] page fetches via /api/order/[id], which uses the
--      service role and bypasses RLS entirely). Admin OrderFeed DOES use
--      the anon client + Realtime, so the owner-scoped policy is what keeps
--      real-time ticks flowing.
--
--   2. v_public_tenants view — a read-only view that strips `pos_config`,
--      `contact_email`, `owner_phone`, `owner_name` so storefront reads can
--      never leak ESB bearer tokens or owner PII even if a future change
--      switches from service-role to anon reads.
--
--   3. admin_chat_history UPDATE policy — add the tenant-ownership check
--      to the `with check` clause for consistency with INSERT.

-- ═══════════════════════════════════════════════════
-- 1. Lock down orders RLS
-- ═══════════════════════════════════════════════════

drop policy if exists "Customers can read orders" on public.orders;

-- Owners see orders for tenants they own. Service-role reads bypass RLS.
create policy "Owners read tenant orders"
  on public.orders for select
  using (
    tenant_id in (
      select id from public.tenants where owner_user_id = auth.uid()
    )
  );

-- Allow authenticated phone-OTP customers to read their own orders. The
-- Supabase session carries the phone number in the JWT when signed in with
-- phone auth; match it against the stored customer_phone. Email-auth users
-- don't carry a phone claim, so this naturally doesn't apply to them.
-- When neither matches, the service-role /api/order/[id] route still works
-- (RLS bypassed) — this policy is just for direct anon reads.
create policy "Customers read own orders by phone"
  on public.orders for select
  using (
    customer_phone is not null
    and customer_phone = coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'phone',
      ''
    )
  );

-- ═══════════════════════════════════════════════════
-- 2. Public tenant view (strips pos_config + owner PII)
-- ═══════════════════════════════════════════════════

create or replace view public.v_public_tenants as
select
  id, slug, name, tagline, logo_url, colors, support_whatsapp,
  country_code, currency_symbol, locale, fallback_coords,
  features, tiers, rewards, pos_provider,
  operating_hours, subscription_tier, is_active,
  theme_template, hero_image_url,
  created_at, updated_at
from public.tenants
where is_active = true;

comment on view public.v_public_tenants is
  'Storefront-safe tenant projection. Strips pos_config (encrypted ESB bearer token), owner_*, and contact_email.';

-- Views in Supabase inherit RLS from their base tables by default (as of
-- Postgres 15 with security_invoker). Make the grants explicit so anon can
-- read the view directly even after the base-table RLS tightens.
grant select on public.v_public_tenants to anon, authenticated;

-- ═══════════════════════════════════════════════════
-- 3. admin_chat_history UPDATE policy — consistent tenant check
-- ═══════════════════════════════════════════════════

drop policy if exists "Owner updates own admin chat" on public.admin_chat_history;
create policy "Owner updates own admin chat"
  on public.admin_chat_history for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.tenants t
      where t.id = tenant_id and t.owner_user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.tenants t
      where t.id = tenant_id and t.owner_user_id = auth.uid()
    )
  );
