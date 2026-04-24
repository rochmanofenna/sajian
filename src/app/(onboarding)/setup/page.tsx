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
import type { TenantDraft } from '@/lib/onboarding/types';

type DeviceMode = 'phone' | 'desktop';

// When the owner lands on /setup from /admin we pre-fill the draft from their
// live tenant instead of showing an empty shell. Browser-client RLS was
// silently filtering menu items (`is_available=false` rows and nested embed
// edge cases returned empty arrays), so we fetch through a server route that
// uses the service client after verifying ownership via the auth cookie.
interface SeedResult {
  draft: TenantDraft;
  source: 'esb' | 'native';
  stats: { categories: number; items: number };
  esbWarning: string | null;
}

async function seedDraftFromLiveTenant(): Promise<SeedResult | null> {
  const host = window.location.hostname;
  const sub = host.split(':')[0].split('.')[0];
  if (!sub || sub === 'sajian' || sub === 'www' || sub === 'localhost') return null;

  try {
    const res = await fetch(`/api/onboarding/seed-from-live?slug=${encodeURIComponent(sub)}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      // 401/403/404 just mean "this user isn't the owner of this subdomain"
      // — treat as a silent no-op so a stranger hitting /setup on a tenant
      // domain falls through to the fresh-onboarding flow.
      return null;
    }
    const body = (await res.json()) as SeedResult;
    if (!body.draft) return null;
    return body;
  } catch {
    return null;
  }
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
        const seeded = await seedDraftFromLiveTenant();
        if (seeded) {
          await useOnboarding.getState().patchDraft(seeded.draft);
          // Swap the greeting when either:
          //   · it's the fresh-onboarding default (id='greeting'), OR
          //   · it's a stale resetup greeting saved from a previous visit
          //     that reported "0 menu di 0 kategori" while the seed now has
          //     real counts — persisted numbers must never lag reality.
          const messages = useOnboarding.getState().messages;
          const onlyDefaultGreeting =
            messages.length === 1 && messages[0].id === 'greeting';
          const onlyStaleResetupGreeting =
            messages.length === 1 &&
            messages[0].id === 'resetup-greeting' &&
            /0 menu di 0 kategori/.test(messages[0].content) &&
            seeded.stats.items > 0;
          if (onlyDefaultGreeting || onlyStaleResetupGreeting) {
            const { categories, items } = seeded.stats;
            const esbLine =
              seeded.source === 'esb'
                ? `\n\n_Menu kamu disinkronisasi dari ESB — ganti harga/availability di portal ESB. Di sini kamu bisa ubah warna, logo, tagline, jam buka, dan layout._`
                : '';
            const warningLine = seeded.esbWarning
              ? `\n\nCatatan: ${seeded.esbWarning}`
              : '';
            const changeExamples =
              seeded.source === 'esb'
                ? `• "Warna primary lebih gelap"\n• "Ganti tagline jadi X"\n• "Jam buka senin 8 pagi"\n• "Ganti layout kayak kedai"`
                : `• "Naikin harga nasi goreng jadi 30rb"\n• "Tambah es kopi susu 15rb ke minuman"\n• "Warna primary lebih gelap"\n• "Hapus kategori snack"`;
            await useOnboarding.getState().setMessages([
              {
                id: 'resetup-greeting',
                role: 'assistant',
                kind: 'text',
                createdAt: Date.now(),
                content: `Halo lagi. Tokomu **${seeded.draft.name}** udah online — ${items} menu di ${categories} kategori.${esbLine}${warningLine}\n\nMau ubah apa? Contoh:\n${changeExamples}`,
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
      if (!res.ok) {
        const traceHint = body.request_id
          ? ` (ref: ${String(body.request_id).slice(0, 8)})`
          : '';
        throw new Error(
          (body.error ? `${body.error}${traceHint}` : `Gagal meluncurkan${traceHint}`),
        );
      }
      router.push(`/setup/launch?slug=${encodeURIComponent(body.slug)}`);
    } catch (e) {
      console.error('[launch] failed', e);
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
