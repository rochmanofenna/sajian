'use client';

// Main onboarding surface. Chat on the left, live phone-framed preview on
// the right. The preview is an <iframe> pointing at /preview/{userId} so the
// owner sees exactly what their customers will see, rendered at a phone's
// aspect ratio for immediate credibility.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, Smartphone, Monitor } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useOnboarding } from '@/lib/onboarding/store';
import { ChatPanel } from '@/components/onboarding/ChatPanel';

type DeviceMode = 'phone' | 'desktop';

export default function SetupPage() {
  const router = useRouter();
  const init = useOnboarding((s) => s.init);
  const userId = useOnboarding((s) => s.userId);
  const draft = useOnboarding((s) => s.draft);
  const [booting, setBooting] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('phone');
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
    <div className="ob-grid">
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
