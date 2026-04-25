-- Sajian 017: tenant typography settings.
--
-- Owners can pick any Google Fonts pair via chat. Two columns let
-- heading + body fonts diverge (a common pairing pattern). Null means
-- "use the template default" — the root layout already loads
-- Plus_Jakarta_Sans + Fraunces + JetBrains_Mono and exposes them as
-- --font-sans / --font-display, so a null here renders unchanged.

alter table public.tenants
  add column if not exists heading_font_family text,
  add column if not exists body_font_family text;

comment on column public.tenants.heading_font_family is
  'Google Fonts family name for headings (e.g. "Fraunces", "Playfair Display"). Null = template default.';
comment on column public.tenants.body_font_family is
  'Google Fonts family name for body text. Null = template default.';
