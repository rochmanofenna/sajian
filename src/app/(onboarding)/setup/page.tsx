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

// When the owner lands on /setup from /admin we pre-fill the draft from their
// live tenant instead of showing an empty shell. The preview then reflects
// their actual store on load, and any edit the owner makes via AI chat either
// updates the live tenant (POST /api/onboarding/launch detects existing
// ownership) or creates a fresh one (apex /signup path).
//
// IMPORTANT: pull every column the preview might render — dropping a field
// here makes the preview look incomplete even though the live store is fine.
async function seedDraftFromLiveTenant(userId: string): Promise<TenantDraft | null> {
  const host = window.location.hostname;
  const sub = host.split(':')[0].split('.')[0];
  if (!sub || sub === 'sajian' || sub === 'www' || sub === 'localhost') return null;

  const supabase = createClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select(
      'id, slug, name, tagline, colors, theme_template, logo_url, hero_image_url, operating_hours, pos_provider, owner_user_id',
    )
    .eq('slug', sub)
    .maybeSingle();
  if (!tenant || tenant.owner_user_id !== userId) return null;

  const { data: cats } = await supabase
    .from('menu_categories')
    .select(
      'name, sort_order, menu_items(name, price, description, image_url, is_available, tags, sort_order)',
    )
    .eq('tenant_id', tenant.id)
    .order('sort_order');

  type DBItem = MenuItemDraft & { sort_order?: number };
  const menuCategories: CategoryDraft[] = (cats ?? []).map((c) => ({
    name: c.name as string,
    items: ((c.menu_items as DBItem[] | null) ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((i) => ({
        name: i.name,
        price: i.price,
        description: i.description,
        image_url: i.image_url ?? null,
        is_available: i.is_available ?? true,
        tags: i.tags ?? [],
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
    pos_provider: (tenant.pos_provider as TenantDraft['pos_provider']) ?? undefined,
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

      // Re-seed from the live tenant on entry when we're on a tenant
      // subdomain. Two cases trigger this:
      //   · No name in draft — fresh session, first seed.
      //   · Name present but menu empty — recovery from stale drafts that
      //     were seeded before the full-menu seed pass shipped.
      //   · The owner clicked "Setup ulang dengan AI" from /admin — we want
      //     the preview to reflect current reality, not last session's edits.
      // To keep it simple, we re-seed whenever (draft.menu_categories is
      // empty) AND (we're on a tenant subdomain the user owns). Pending
      // chat-driven edits still live in messages, so the conversation
      // carries forward even when the draft is freshly re-pulled.
      const current = useOnboarding.getState().draft;
      const draftIsStale =
        !current.name ||
        !current.menu_categories ||
        !current.menu_categories.some((c) => c.items.length > 0);
      if (draftIsStale) {
        const seeded = await seedDraftFromLiveTenant(user.id);
        if (seeded) {
          await useOnboarding.getState().patchDraft(seeded);
          // If the only message is the fresh-onboarding greeting, swap it
          // for a re-setup greeting that knows the store is already live.
          const messages = useOnboarding.getState().messages;
          const onlyDefaultGreeting =
            messages.length === 1 && messages[0].id === 'greeting';
          if (onlyDefaultGreeting) {
            const itemCount =
              seeded.menu_categories?.reduce((n, c) => n + c.items.length, 0) ?? 0;
            const catCount = seeded.menu_categories?.length ?? 0;
            await useOnboarding.getState().setMessages([
              {
                id: 'resetup-greeting',
                role: 'assistant',
                kind: 'text',
                createdAt: Date.now(),
                content: `Halo lagi! 👋 Tokomu **${seeded.name}** udah online — ${itemCount} menu di ${catCount} kategori.\n\nMau ubah apa? Contoh:\n• "Naikin harga nasi goreng jadi 30rb"\n• "Tambah es kopi susu 15rb ke minuman"\n• "Warna primary lebih gelap"\n• "Hapus kategori snack"`,
              },
            ]);
          }
        }
      }

      setBooting(false);
    })();
  }, [init, router]);

  // Live preview via postMessage. Every draft change gets relayed to the
  // iframe so the owner sees colors + menu + logo update without a reload or
  // flicker. Debounce the send by 80ms so a burst of patches (e.g. AI adding
  // 10 menu items at once) collapses into one repaint.
  useEffect(() => {
    if (!iframeRef.current || !userId) return;
    const t = setTimeout(() => {
      const el = iframeRef.current;
      el?.contentWindow?.postMessage(
        { type: 'sajian:draft', draft },
        window.location.origin,
      );
    }, 80);
    return () => clearTimeout(t);
  }, [draft, userId]);

  // Preview announces readiness after it mounts — replay the current draft
  // so the first paint reflects any edits that happened before the iframe
  // loaded (e.g. the seed-from-live-tenant flow).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string } | null;
      if (data?.type === 'sajian:preview:ready') {
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'sajian:draft', draft: useOnboarding.getState().draft },
          window.location.origin,
        );
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

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
