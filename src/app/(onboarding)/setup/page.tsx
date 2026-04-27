'use client';

// Main onboarding surface. Chat on the left, live phone-framed preview on
// the right. The preview is an <iframe> pointing at /preview/{userId} so the
// owner sees exactly what their customers will see, rendered at a phone's
// aspect ratio for immediate credibility.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  if (!sub || sub === 'sajian' || sub === 'www' || sub === 'app' || sub === 'localhost') return null;

  try {
    // Hard cap the seed-from-live fetch so a slow ESB call can't stall
    // the entire /setup boot. The page falls through to the fresh-
    // onboarding flow if this times out.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`/api/onboarding/seed-from-live?slug=${encodeURIComponent(sub)}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      // 401/403/404 just mean "this user isn't the owner of this subdomain"
      // — treat as a silent no-op so a stranger hitting /setup on a tenant
      // domain falls through to the fresh-onboarding flow.
      return null;
    }
    const body = (await res.json()) as SeedResult;
    if (!body.draft) return null;
    return body;
  } catch (err) {
    console.warn('[setup] seed-from-live failed', err);
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
    const bootedAt = Date.now();
    console.log('[setup] mount', { href: window.location.href });
    (async () => {
      try {
        const supabase = createClient();
        console.log('[setup] supabase client ready', { ms: Date.now() - bootedAt });
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();
        console.log('[setup] auth.getUser resolved', {
          ms: Date.now() - bootedAt,
          hasUser: Boolean(user),
          err: userErr?.message,
        });
        if (!user) {
          router.replace('/signup');
          return;
        }
        await init(user.id, user.phone ?? user.email ?? '');
        console.log('[setup] draft init complete', { ms: Date.now() - bootedAt });

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

        console.log('[setup] boot finished', { ms: Date.now() - bootedAt });
        setBooting(false);
      } catch (err) {
        console.error('[setup] boot failed', err);
        // Fail open — let the owner see the UI even if seed-from-live
        // stalls; the chat still works against the local draft.
        setBooting(false);
      }
    })();
  }, [init, router]);

  // Proxy-mode preview: iframe loads the real tenant subdomain with
  // ?preview=&preview_token=. Internal links (Lihat Menu, Cart,
  // Checkout) navigate naturally inside the iframe because every URL
  // is part of the same site. Token is short-lived (~15 min) so we
  // refresh it on a 14-minute cadence.
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewIframeOrigin, setPreviewIframeOrigin] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Tenant-existence gate. The AI auto-derives a slug as soon as the
  // owner names the restaurant (ChatPanel update_name handler), so
  // draft.slug becomes truthy long before there's a tenants row. If
  // we render the iframe at that point, the storefront subdomain
  // falls through to the Sajian marketing page (no tenant resolved
  // → MarketingHome) and the preview looks broken. Stay null until
  // /api/onboarding/preview-token confirms the row exists; then flip.
  const [tenantExists, setTenantExists] = useState(false);

  const obtainPreviewUrl = useCallback(async () => {
    if (!draft?.slug) return;
    try {
      const res = await fetch('/api/onboarding/preview-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_slug: draft.slug }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Gagal membuat preview token');
      const url = body.preview_url as string;
      setPreviewSrc(url);
      setTenantExists(Boolean(body.tenant_exists));
      try {
        setPreviewIframeOrigin(new URL(url).origin);
      } catch {
        setPreviewIframeOrigin(null);
      }
      setPreviewError(null);
    } catch (err) {
      setPreviewError((err as Error).message);
    }
  }, [draft?.slug]);

  // Mint on slug-known + every 14 minutes thereafter so the cookie
  // never expires mid-session.
  useEffect(() => {
    if (!draft?.slug) return;
    obtainPreviewUrl();
    const id = setInterval(obtainPreviewUrl, 14 * 60_000);
    return () => clearInterval(id);
  }, [draft?.slug, obtainPreviewUrl]);

  // Cross-origin nudge to reload the iframe whenever the draft moves.
  // The storefront has a tiny PreviewLiveReloadClient listening for
  // `sajian:reload` messages from the app origin — debounced here so a
  // burst of AI edits collapses into one reload.
  useEffect(() => {
    if (!iframeRef.current || !previewIframeOrigin) return;
    const t = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'sajian:reload' },
        previewIframeOrigin,
      );
    }, 600);
    return () => clearTimeout(t);
  }, [draft, previewIframeOrigin]);

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
          {previewSrc && tenantExists && (
            <iframe
              ref={iframeRef}
              src={previewSrc}
              title="Preview"
              className="ob-device__frame"
              // Proxy-mode preview lives at the real tenant subdomain.
              // It's already cross-origin from the parent (sajian.app);
              // the same-origin policy enforces isolation without the
              // `sandbox` attribute and the iframe needs its own
              // cookies (preview-token cookie + cart cookie) for
              // navigation to keep state, which sandbox would block.
              referrerPolicy="no-referrer"
            />
          )}
          {!previewSrc && !previewError && !draft?.slug && (
            <div className="ob-device__empty">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>
                Preview muncul setelah kamu kasih nama toko di chat —
                slug-nya bakal jadi alamat preview-nya.
              </span>
            </div>
          )}
          {!previewSrc && !previewError && draft?.slug && (
            <div className="ob-device__empty">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Menyiapkan preview…</span>
            </div>
          )}
          {previewSrc && !tenantExists && !previewError && (
            <div className="ob-device__empty">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>
                Preview siap setelah kamu klik LAUNCH di pojok kanan
                atas. Sementara, ngobrol dulu sama aku aja — aku catat
                semuanya ke draft.
              </span>
            </div>
          )}
          {previewError && (
            <div className="ob-device__error">
              Preview belum siap: {previewError}. Coba refresh sebentar lagi.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
