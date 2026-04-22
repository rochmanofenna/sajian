'use client';

// Main onboarding surface. Chat on the left, live preview on the right.
// The preview is an <iframe> pointing at /preview/{userId}, which reads the
// latest draft from onboarding_drafts and renders a storefront.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useOnboarding } from '@/lib/onboarding/store';
import { ChatPanel } from '@/components/onboarding/ChatPanel';

export default function SetupPage() {
  const router = useRouter();
  const init = useOnboarding((s) => s.init);
  const userId = useOnboarding((s) => s.userId);
  const draft = useOnboarding((s) => s.draft);
  const [booting, setBooting] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/signup');
        return;
      }
      await init(user.id, user.phone ?? user.email ?? '');
      setBooting(false);
    })();
  }, [init, router]);

  // Nudge the iframe to re-render when the draft changes. The preview route
  // reads from Supabase, so a soft reload is enough. Debounced 500ms to
  // avoid thrashing during fast edits.
  useEffect(() => {
    if (!iframeRef.current || !userId) return;
    const t = setTimeout(() => {
      const el = iframeRef.current;
      if (el?.contentWindow) {
        el.contentWindow.location.reload();
      }
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
      <div className="h-[calc(100vh-56px)] flex items-center justify-center text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Memuat…
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 h-[calc(100vh-56px)]">
      <section className="border-r border-[#1B5E3B]/10 bg-[#FDF6EC]/60">
        <ChatPanel onLaunch={launch} />
      </section>

      <section className="bg-white relative overflow-hidden">
        {launching && (
          <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center text-[#1B5E3B]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Meluncurkan…
          </div>
        )}
        {launchError && (
          <div className="absolute bottom-4 left-4 right-4 z-10 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
            {launchError}
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={`/preview/${userId}`}
          title="Preview"
          className="w-full h-full border-0"
        />
      </section>
    </div>
  );
}
