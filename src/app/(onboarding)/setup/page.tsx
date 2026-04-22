'use client';

// Main onboarding surface. Chat on the left, live phone-framed preview on
// the right. The preview is an <iframe> pointing at /preview/{userId} so the
// owner sees exactly what their customers will see, rendered at a phone's
// aspect ratio for immediate credibility.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, Smartphone, Monitor, MessageCircle, Eye } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useOnboarding } from '@/lib/onboarding/store';
import { ChatPanel } from '@/components/onboarding/ChatPanel';
import type { CategoryDraft, MenuItemDraft, TenantDraft } from '@/lib/onboarding/types';

type DeviceMode = 'phone' | 'desktop';

// When the owner lands on /setup from /admin we want to pre-fill the draft
// from their live tenant instead of showing an empty shell. Everything they
// edit then either updates the live tenant (if POST /api/onboarding/launch
// detects an existing ownership) or creates a fresh one (apex /signup path).
async function seedDraftFromLiveTenant(userId: string): Promise<TenantDraft | null> {
  const host = window.location.hostname;
  const sub = host.split(':')[0].split('.')[0];
  if (!sub || sub === 'sajian' || sub === 'www' || sub === 'localhost') return null;

  const supabase = createClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select(
      'id, slug, name, tagline, colors, theme_template, logo_url, hero_image_url, operating_hours, owner_user_id',
    )
    .eq('slug', sub)
    .maybeSingle();
  if (!tenant || tenant.owner_user_id !== userId) return null;

  const { data: cats } = await supabase
    .from('menu_categories')
    .select(
      'name, sort_order, menu_items(name, price, description, sort_order)',
    )
    .eq('tenant_id', tenant.id)
    .order('sort_order');

  const menuCategories: CategoryDraft[] = (cats ?? []).map((c) => ({
    name: c.name as string,
    items: ((c.menu_items as MenuItemDraft[] | null) ?? [])
      .slice()
      .sort((a, b) => ((a as MenuItemDraft & { sort_order?: number }).sort_order ?? 0) - ((b as MenuItemDraft & { sort_order?: number }).sort_order ?? 0))
      .map((i) => ({
        name: i.name,
        price: i.price,
        description: i.description,
      })),
  }));

  return {
    name: tenant.name as string,
    slug: tenant.slug as string,
    tagline: (tenant.tagline as string | null) ?? undefined,
    colors: (tenant.colors as TenantDraft['colors']) ?? undefined,
    theme_template: (tenant.theme_template as TenantDraft['theme_template']) ?? undefined,
    logo_url: (tenant.logo_url as string | null) ?? null,
    hero_image_url: (tenant.hero_image_url as string | null) ?? null,
    operating_hours: (tenant.operating_hours as TenantDraft['operating_hours']) ?? undefined,
    menu_categories: menuCategories,
  };
}

export default function SetupPage() {
  const router = useRouter();
  const init = useOnboarding((s) => s.init);
  const userId = useOnboarding((s) => s.userId);
  const draft = useOnboarding((s) => s.draft);
  const [booting, setBooting] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('phone');
  const [mobilePane, setMobilePane] = useState<'chat' | 'preview'>('chat');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/signup');
        return;
      }
      await init(user.id, user.phone ?? user.email ?? '');

      // If we're on a tenant subdomain and the store has no draft data yet,
      // seed it from the live tenant so the preview shows their actual store.
      const current = useOnboarding.getState().draft;
      if (!current.name) {
        const seeded = await seedDraftFromLiveTenant(user.id);
        if (seeded) await useOnboarding.getState().patchDraft(seeded);
      }

      setBooting(false);
    })();
  }, [init, router]);

  // Debounce preview reload so rapid draft changes don't thrash the iframe.
  useEffect(() => {
    if (!iframeRef.current || !userId) return;
    const t = setTimeout(() => {
      const el = iframeRef.current;
      if (el?.contentWindow) el.contentWindow.location.reload();
    }, 500);
    return () => clearTimeout(t);
  }, [draft, userId]);

  async function launch() {
    setLaunching(true);
    setLaunchError(null);
    try {
      const res = await fetch('/api/onboarding/launch', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Gagal meluncurkan');
      router.push(`/setup/launch?slug=${encodeURIComponent(body.slug)}`);
    } catch (e) {
      setLaunchError((e as Error).message);
      setLaunching(false);
    }
  }

  if (booting || !userId) {
    return (
      <div className="ob-booting">
        <Loader2 className="h-4 w-4 animate-spin" /> <span>Memuat percakapan…</span>
      </div>
    );
  }

  return (
    <div className="ob-grid" data-pane={mobilePane}>
      <nav className="ob-pane-toggle" aria-label="Tampilan">
        <button
          type="button"
          data-active={mobilePane === 'chat'}
          onClick={() => setMobilePane('chat')}
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Chat</span>
        </button>
        <button
          type="button"
          data-active={mobilePane === 'preview'}
          onClick={() => setMobilePane('preview')}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Preview</span>
        </button>
      </nav>

      <section className="ob-chat">
        <div className="ob-chat__head">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Asisten Sajian</span>
          <span className="ob-chat__kicker">mengisi draft toko kamu</span>
        </div>
        <ChatPanel onLaunch={launch} />
      </section>

      <section className="ob-preview">
        <div className="ob-preview__topbar">
          <div className="ob-preview__label">
            <span className="ob-preview__label-dot" aria-hidden="true" />
            Preview — yang dilihat pelanggan
          </div>
          <div className="ob-device-toggle" role="tablist" aria-label="Mode preview">
            <button
              type="button"
              role="tab"
              aria-selected={deviceMode === 'phone'}
              data-active={deviceMode === 'phone'}
              onClick={() => setDeviceMode('phone')}
            >
              <Smartphone className="h-3 w-3" aria-hidden="true" />
              <span>Phone</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={deviceMode === 'desktop'}
              data-active={deviceMode === 'desktop'}
              onClick={() => setDeviceMode('desktop')}
            >
              <Monitor className="h-3 w-3" aria-hidden="true" />
              <span>Desktop</span>
            </button>
          </div>
        </div>

        <div className={`ob-device ob-device--${deviceMode}`}>
          {deviceMode === 'phone' && (
            <span className="ob-device__speaker" aria-hidden="true" />
          )}
          {deviceMode === 'desktop' && (
            <div className="ob-device__chrome" aria-hidden="true">
              <span className="ob-device__dot ob-device__dot--r" />
              <span className="ob-device__dot ob-device__dot--y" />
              <span className="ob-device__dot ob-device__dot--g" />
              <span className="ob-device__url">
                {(draft.slug ?? 'nama-toko')}.sajian.app
              </span>
            </div>
          )}
          {launching && (
            <div className="ob-device__launching">
              <Loader2 className="h-4 w-4 animate-spin" />
              Meluncurkan restoran kamu…
            </div>
          )}
          {launchError && (
            <div className="ob-device__error">{launchError}</div>
          )}
          <iframe
            ref={iframeRef}
            src={`/preview/${userId}`}
            title="Preview"
            className="ob-device__frame"
          />
        </div>
      </section>
    </div>
  );
}
